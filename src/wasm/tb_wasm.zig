//! In-process, single-node TigerBeetle for WebAssembly (Cloudflare Workers, browsers, etc).
//!
//! There is no VSR replication and no real disk/network IO here: this drives the production
//! state machine (LSM forest + accounting logic) directly against the in-memory
//! `testing/storage.zig` backend, the same one used by the deterministic simulator (VOPR).
//! Storage exists only for the lifetime of the WASM instance.
const std = @import("std");
const assert = std.debug.assert;

const vsr = @import("vsr");
const stdx = vsr.stdx;
const constants = vsr.constants;
const tb = vsr.tigerbeetle;

const TimeSim = @import("../testing/time.zig").TimeSim;
const Storage = @import("../testing/storage.zig").Storage;
const Tracer = Storage.Tracer;
const SuperBlock = vsr.SuperBlockType(Storage);
const Grid = vsr.GridType(Storage);
const StateMachine = @import("../state_machine.zig").StateMachineType(Storage);
const MultiBatchEncoder = @import("../vsr/multi_batch.zig").MultiBatchEncoder;
const MultiBatchDecoder = @import("../vsr/multi_batch.zig").MultiBatchDecoder;
const data_file_size_min = @import("../vsr/superblock.zig").data_file_size_min;

// `data_file_size_min` is, by definition, the size of a data file with an *empty* grid — using
// it directly as `storage_size_limit` (as the original version of this file did) leaves
// `grid_size_limit() == 0`: no space for the grid to ever write a compacted table into. Past a
// couple hundred committed events the LSM's mutable table fills up with nowhere to flush to and
// asserts. `grid_extra_blocks` gives the grid real (if modest) capacity; sized to fit this
// engine's `heap_buffer` (see below) alongside the manifest log/indices it also draws from.
const grid_extra_blocks = 4096;
const storage_size_limit = data_file_size_min + grid_extra_blocks * constants.block_size;

const Operation = StateMachine.Operation;

// `src/config.zig` picks `configs.default_production` (multi-hundred-MB block/cache sizing) for
// any regular executable, and only picks the much smaller `configs.test_min` when compiled as a
// Zig test (`builtin.is_test`) — which is why the exact same production `StateMachine`/`Forest`
// code stays cheap under `state_machine_tests.zig` but was blowing well past a gigabyte here.
// `root.tigerbeetle_config` (checked by config.zig before either default) is the supported
// override point for exactly this; reusing `test_min` rather than inventing a new profile keeps
// this on a config TigerBeetle's own tests already exercise heavily.
pub const tigerbeetle_config = @import("../config.zig").configs.test_min;

// Silences the `debug(trace)`/`debug(manifest_log)` scoped logging the state machine/grid emit
// by default — noisy on every `tb_wasm_submit` call and irrelevant to a host embedding this as a
// library rather than running it as a CLI.
pub const std_options: std.Options = .{ .log_level = .warn };

// Two allocators were tried and rejected before this one:
//   - `std.heap.page_allocator` (`std.heap.WasmAllocator` on wasm32): panics
//     ("index out of bounds") on the multi-megabyte single allocations this engine makes.
//   - wasi-libc's `malloc` (emmalloc, via `linkLibC()`): traps inside `sbrk` on the ~90MB
//     manifest-log hashmap allocation (see the comment on `heap_buffer` below for why it's that
//     large) — emmalloc isn't designed to serve single allocations that big.
// A `FixedBufferAllocator` over one large static buffer sidesteps both: it's just pointer bump
// and bounds-check arithmetic, so a single huge allocation is no different from a small one.
// `heap_buffer` is zero-initialized (`.bss`), so it costs runtime linear memory, not `.wasm`
// file size.
//
// The production LSM forest sizes its manifest log for a full-scale deployment
// (`table_count_max` is a comptime constant, not derived from the small runtime
// `storage_size_limit` this engine actually uses — see the TODO in `src/lsm/forest.zig`), so
// even a single, otherwise-tiny in-memory instance needs on the order of 150-200MB. That's a
// real memory-budget concern for constrained hosts (e.g. a 128MB Workers/Durable-Object
// isolate) that reusing the unmodified state machine doesn't let us avoid without shrinking
// those comptime LSM constants — out of scope for this change; see the final report.
const heap_size = 64 * 1024 * 1024;
var heap_buffer: [heap_size]u8 = undefined;
var heap_fba = std.heap.FixedBufferAllocator.init(&heap_buffer);
const gpa = heap_fba.allocator();

// One TigerBeetle instance is meant to be owned by exactly one Durable Object (one cluster /
// ledger per DO); a small table still allows a single Worker-side experiment to juggle a few
// independent in-memory ledgers without a DO, at the cost of dividing up `heap_buffer` further.
const instances_max = 2;

const Instance = struct {
    arena: std.heap.ArenaAllocator,
    time_sim: TimeSim,
    trace: Tracer,
    storage: Storage,
    superblock: SuperBlock,
    grid: Grid,
    state_machine: StateMachine,

    op: u64 = 1,

    superblock_context: SuperBlock.Context = undefined,
    open_done: bool = false,
    prefetch_done: bool = false,
    compact_done: bool = false,

    /// Scratch buffers reused across calls: input gets multi-batch-encoded here, output is
    /// decoded from the state machine's multi-batch reply into a plain, unwrapped array that
    /// callers can read as a flat slice of `Result`/`Account`/`Transfer` structs.
    input_encoded: [constants.message_body_size_max]u8 align(constants.cache_line_size) = undefined,
    output_raw: [constants.message_body_size_max]u8 align(constants.cache_line_size) = undefined,
    output_flat: [constants.message_body_size_max]u8 align(constants.cache_line_size) = undefined,
    output_flat_len: u32 = 0,

    fn deinit(instance: *Instance) void {
        instance.state_machine.deinit(instance.arena.allocator());
        instance.grid.deinit(instance.arena.allocator());
        instance.superblock.deinit(instance.arena.allocator());
        instance.storage.deinit(instance.arena.allocator());
        instance.trace.deinit(instance.arena.allocator());
        instance.arena.deinit();
    }
};

var instances: [instances_max]?*Instance = .{null} ** instances_max;

pub const InitStatus = enum(i32) {
    ok = 0,
    out_of_handles = -1,
    out_of_memory = -2,
};

pub const SubmitStatus = enum(i32) {
    ok = 0,
    invalid_handle = -1,
    invalid_operation = -2,
    input_invalid = -3,
    batch_too_large = -4,
};

fn find_free_slot() ?usize {
    for (instances, 0..) |slot, i| {
        if (slot == null) return i;
    }
    return null;
}

/// Creates a new single-node, in-memory TigerBeetle instance.
/// `cluster_id`/`replica_id` are cosmetic here (there is no real cluster) but are threaded
/// through so results (e.g. timestamps) are reproducible per handle.
export fn tb_wasm_init(cluster_id: u64, replica_id: u32) i32 {
    const slot = find_free_slot() orelse return @intFromEnum(InitStatus.out_of_handles);

    const instance = gpa.create(Instance) catch return @intFromEnum(InitStatus.out_of_memory);
    errdefer gpa.destroy(instance);

    instance.arena = std.heap.ArenaAllocator.init(gpa);
    const arena = instance.arena.allocator();

    init_instance(instance, arena, cluster_id, replica_id) catch |err| {
        std.debug.print("tb_wasm_init failed: {}\n", .{err});
        instance.arena.deinit();
        gpa.destroy(instance);
        return @intFromEnum(InitStatus.out_of_memory);
    };

    instances[slot] = instance;
    return @intCast(slot);
}

fn init_instance(
    instance: *Instance,
    arena: std.mem.Allocator,
    cluster_id: u64,
    replica_id: u32,
) !void {
    instance.time_sim = .{
        .resolution = constants.tick_ms * std.time.ns_per_ms,
        .offset_type = .linear,
        .offset_coefficient_A = 0,
        .offset_coefficient_B = 0,
        .offset_coefficient_C = 0,
    };
    instance.time_sim.ticks = 1;

    instance.trace = try Tracer.init(arena, instance.time_sim.time(), .{
        .replica = .{ .cluster = cluster_id, .replica = @intCast(replica_id) },
    }, .{});

    instance.storage = try Storage.init(arena, .{ .size = storage_size_limit });

    // A brand-new in-memory "disk" needs the same one-time format step a real `tigerbeetle
    // format` CLI invocation performs (writes the WAL + superblock headers) before it can be
    // opened — skipping straight to a hand-faked `superblock.opened = true` (as an earlier
    // version of this file did, mirroring `state_machine_tests.zig`'s lighter-weight pattern)
    // leaves the superblock/grid/manifest log in a state real code elsewhere assumes is
    // impossible (e.g. `replica_index == null`, `manifest_log.opened == false`), which
    // `Forest.compact()` — never exercised by that unit-test pattern either — then trips over.
    try vsr.format(Storage, arena, &instance.storage, .{
        .cluster = cluster_id,
        .release = vsr.Release.minimum,
        .replica = @intCast(replica_id),
        .replica_count = 1,
        .view = null,
    });

    instance.superblock = try SuperBlock.init(arena, &instance.storage, .{
        .storage_size_limit = storage_size_limit,
    });
    instance.open_done = false;
    instance.superblock.open(struct {
        fn callback(context: *SuperBlock.Context) void {
            const self: *Instance = @alignCast(@fieldParentPtr("superblock_context", context));
            self.open_done = true;
        }
    }.callback, &instance.superblock_context);
    while (!instance.open_done) instance.storage.run();

    instance.grid = try Grid.init(arena, .{
        .superblock = &instance.superblock,
        .trace = &instance.trace,
        .stash_blocks_count = 1024,
        .missing_blocks_max = 0,
        .missing_tables_max = 0,
        // A real replica sizes this to fit one checkpoint interval's worth of blocks released by
        // compaction (`Replica.open_init`), because it calls `superblock.checkpoint()`
        // periodically to durably mark them and reclaim this space. This engine never calls
        // checkpoint() (no real disk persistence to checkpoint *to* — see the module doc comment
        // on persistence), so released blocks accumulate here indefinitely rather than being
        // bounded per-interval; `0` (this engine's original value) starves it almost
        // immediately once compaction actually releases anything. Using the real per-pipeline
        // sizing formula is still meaningfully better — it holds many checkpoint intervals'
        // worth before exhausting — even though, without checkpointing, *some* finite capacity
        // will eventually be hit on a long-lived enough instance.
        .blocks_released_prior_checkpoint_durability_max = StateMachine.Forest
            .compaction_blocks_released_per_pipeline_max(),
    });
    instance.open_done = false;
    instance.grid.open(struct {
        fn callback(grid: *Grid) void {
            const self: *Instance = @alignCast(@fieldParentPtr("grid", grid));
            self.open_done = true;
        }
    }.callback);
    while (!instance.open_done) instance.storage.run();

    try instance.state_machine.init(
        arena,
        instance.time_sim.time(),
        &instance.grid,
        .{
            .batch_size_limit = constants.message_body_size_max,
            .lsm_forest_compaction_block_count = StateMachine.Forest.Options
                .compaction_block_count_min,
            // Each manifest node costs `constants.lsm_manifest_node_size` (16KiB) out of
            // `heap_buffer` below; `1` (this engine's original value, copied from
            // `state_machine_tests.zig`, where a handful of short-lived unit-test events never
            // exhaust it) starves a real, long-lived ledger's manifest log almost immediately
            // (`error(vsr): out of memory for manifest`) once compaction is actually driven.
            // `lsm_forest_node_count` below is a real, finite capacity bound, not a bug: past it,
            // this engine legitimately needs a bigger `heap_buffer` (or real checkpointing to
            // reclaim manifest space, which this engine doesn't implement — see the module doc
            // comment on persistence). `512` (8MiB) was chosen to comfortably outlast realistic
            // demo/testing workloads within the current 64MiB `heap_buffer`; VOPR (the closest
            // sustained-workload precedent in this codebase) uses `4096` (64MiB) — this engine
            // can't afford that alongside everything else `heap_buffer` also holds.
            .lsm_forest_node_count = 512,
            .cache_entries_accounts = 0,
            .cache_entries_transfers = 0,
            .cache_entries_transfers_pending = 0,
            .log_trace = false,
            .aof_recovery = false,
        },
    );
    instance.state_machine.expire_pending_transfers.pulse_next_timestamp =
        @import("../lsm/timestamp_range.zig").TimestampRange.timestamp_max;
    instance.open_done = false;
    instance.state_machine.open(struct {
        fn callback(state_machine: *StateMachine) void {
            const self: *Instance = @fieldParentPtr("state_machine", state_machine);
            self.open_done = true;
        }
    }.callback);
    while (!instance.open_done) instance.storage.run();

    instance.op = 1;
    instance.output_flat_len = 0;
}

export fn tb_wasm_deinit(handle: i32) void {
    const instance = get_instance(handle) orelse return;
    instance.deinit();
    gpa.destroy(instance);
    instances[@intCast(handle)] = null;
}

fn get_instance(handle: i32) ?*Instance {
    if (handle < 0 or handle >= instances_max) return null;
    return instances[@intCast(handle)];
}

/// Returns a pointer into WASM linear memory that callers should write the request body into
/// before calling `tb_wasm_submit`. Reusing one buffer per instance avoids exposing an
/// allocator to JS.
export fn tb_wasm_input_ptr(handle: i32) [*]u8 {
    const instance = get_instance(handle) orelse return undefined;
    return &instance.input_encoded;
}

export fn tb_wasm_input_capacity(handle: i32) u32 {
    _ = handle;
    return constants.message_body_size_max;
}

/// Submits one batch of `len` bytes (raw, non-multi-batch-encoded events, e.g. a concatenation
/// of `Account` structs for `create_accounts`) previously written at `tb_wasm_input_ptr`, and
/// runs it to completion synchronously. Because storage is in-memory and fully synchronous,
/// there is no real asynchrony: by the time this returns, the reply is already available via
/// `tb_wasm_output_ptr`/`tb_wasm_output_len`.
export fn tb_wasm_submit(handle: i32, operation_raw: u8, len: u32) i32 {
    const instance = get_instance(handle) orelse return @intFromEnum(SubmitStatus.invalid_handle);

    const operation = std.meta.intToEnum(Operation, operation_raw) catch
        return @intFromEnum(SubmitStatus.invalid_operation);

    if (len > instance.input_encoded.len) return @intFromEnum(SubmitStatus.batch_too_large);
    const input_raw: []align(constants.cache_line_size) const u8 = instance.input_encoded[0..len];

    const message_body: []align(constants.cache_line_size) const u8 = encode: {
        if (!operation.is_multi_batch()) break :encode input_raw;

        // Wrap the caller's single flat batch into the multi-batch wire format the state
        // machine expects (one batch containing everything the caller submitted).
        var scratch: [constants.message_body_size_max]u8 align(constants.cache_line_size) =
            undefined;
        stdx.copy_disjoint(.exact, u8, scratch[0..len], input_raw);

        var encoder = MultiBatchEncoder.init(&instance.output_raw, .{
            .element_size = operation.event_size(),
        });
        const writable = encoder.writable() orelse
            return @intFromEnum(SubmitStatus.batch_too_large);
        if (writable.len < len) return @intFromEnum(SubmitStatus.batch_too_large);
        stdx.copy_disjoint(.exact, u8, writable[0..len], scratch[0..len]);
        encoder.add(len);
        const n = encoder.finish();
        break :encode instance.output_raw[0..n];
    };

    if (!instance.state_machine.input_valid(operation, message_body)) {
        return @intFromEnum(SubmitStatus.input_invalid);
    }

    instance.state_machine.prepare(operation, message_body);
    if (instance.state_machine.prepare_timestamp == instance.state_machine.commit_timestamp) {
        instance.state_machine.prepare_timestamp += 1;
    }
    const timestamp = instance.state_machine.prepare_timestamp;

    instance.prefetch_done = false;
    instance.state_machine.prefetch_timestamp = timestamp;
    instance.state_machine.prefetch(
        struct {
            fn callback(state_machine: *StateMachine) void {
                const self: *Instance = @fieldParentPtr("state_machine", state_machine);
                self.prefetch_done = true;
            }
        }.callback,
        instance.op,
        instance.op,
        operation,
        message_body,
    );
    // `Storage.run()` executes any pending in-memory IO callbacks synchronously; since there is
    // no real disk or network, this loop always terminates in a bounded number of iterations.
    while (!instance.prefetch_done) instance.storage.run();

    const client_id: u128 = 1;
    var output_buffer: [constants.message_body_size_max]u8 align(constants.cache_line_size) =
        undefined;
    const size = instance.state_machine.commit(
        client_id,
        instance.op,
        timestamp,
        operation,
        message_body,
        &output_buffer,
    );

    // Matches `Replica.commit_compact()`: called with the just-committed op, every op, no
    // exceptions. `Forest.compact()` decides internally (from `op % constants.lsm_compaction_ops`)
    // whether this call actually does work or is a no-op for this particular op — skipping calls
    // desyncs that beat counter and is not a valid way to "call it less often". Without this, the
    // LSM's mutable table fills after a couple hundred committed events with nowhere to flush to
    // and asserts (`TableMemory.put`) the next time an op tries to insert into a full table.
    instance.compact_done = false;
    instance.state_machine.compact(
        struct {
            fn callback(state_machine: *StateMachine) void {
                const self: *Instance = @fieldParentPtr("state_machine", state_machine);
                self.compact_done = true;
            }
        }.callback,
        instance.op,
    );
    while (!instance.compact_done) instance.storage.run();

    instance.op += 1;

    const reply: []align(constants.cache_line_size) const u8 = output_buffer[0..size];
    if (!operation.is_multi_batch()) {
        stdx.copy_disjoint(.exact, u8, instance.output_flat[0..reply.len], reply);
        instance.output_flat_len = @intCast(reply.len);
    } else {
        var decoder = MultiBatchDecoder.init(reply, .{
            .element_size = operation.result_size(),
        }) catch unreachable; // Already validated by `commit()`.
        const batch = decoder.pop() orelse &.{};
        assert(decoder.pop() == null); // We only ever submit a single batch.
        stdx.copy_disjoint(.exact, u8, instance.output_flat[0..batch.len], batch);
        instance.output_flat_len = @intCast(batch.len);
    }

    return @intFromEnum(SubmitStatus.ok);
}

export fn tb_wasm_output_ptr(handle: i32) [*]const u8 {
    const instance = get_instance(handle) orelse return undefined;
    return &instance.output_flat;
}

export fn tb_wasm_output_len(handle: i32) u32 {
    const instance = get_instance(handle) orelse return 0;
    return instance.output_flat_len;
}

export fn tb_wasm_account_size() u32 {
    return @sizeOf(tb.Account);
}

export fn tb_wasm_transfer_size() u32 {
    return @sizeOf(tb.Transfer);
}

export fn tb_wasm_create_account_result_size() u32 {
    return @sizeOf(tb.CreateAccountResult);
}

export fn tb_wasm_create_transfer_result_size() u32 {
    return @sizeOf(tb.CreateTransferResult);
}

// `Operation` values are derived from `constants.vsr_operations_reserved`, which isn't a fixed
// wire constant — exporting them keeps the JS wrapper from having to hardcode enum numbers.
export fn tb_wasm_op_create_accounts() u8 {
    return @intFromEnum(Operation.create_accounts);
}
export fn tb_wasm_op_create_transfers() u8 {
    return @intFromEnum(Operation.create_transfers);
}
export fn tb_wasm_op_lookup_accounts() u8 {
    return @intFromEnum(Operation.lookup_accounts);
}
export fn tb_wasm_op_lookup_transfers() u8 {
    return @intFromEnum(Operation.lookup_transfers);
}
