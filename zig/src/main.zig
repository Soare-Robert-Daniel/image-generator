const std = @import("std");
const fs = std.fs;
const os = std.os;
const c = @cImport({
    @cInclude("zlib.h");
});

var crc32Table: [256]u32 = undefined;

fn initializeCrc32Table() void {
    var i: u32 = 0;
    while (i < 256) : (i += 1) {
        var k: u32 = i;
        var j: u8 = 0;
        while (j < 8) : (j += 1) {
            if (k & 1 != 0) {
                k = 0xedb88320 ^ (k >> 1);
            } else {
                k = k >> 1;
            }
        }
        crc32Table[i] = k;
    }
}

fn crc32(buf: []const u8) u32 {
    var crc: u32 = 0xffffffff;
    for (buf) |byte| {
        crc = crc32Table[(crc ^ byte) & 0xFF] ^ (crc >> 8);
    }
    return ~crc;
}

fn lerp(a: u8, b: u8, t: f32) u8 {
    return @as(u8, @intFromFloat((1.0 - t) * @as(f32, @floatFromInt(a)) + t * @as(f32, @floatFromInt(b))));
}

fn generateColor(hash: []const u8, t: f32) [4]u8 {
    const baseR = std.fmt.parseInt(u8, hash[0..2], 16) catch unreachable;
    const baseG = std.fmt.parseInt(u8, hash[2..4], 16) catch unreachable;
    const baseB = std.fmt.parseInt(u8, hash[4..6], 16) catch unreachable;

    const nextR = std.fmt.parseInt(u8, hash[6..8], 16) catch unreachable;
    const nextG = std.fmt.parseInt(u8, hash[8..10], 16) catch unreachable;
    const nextB = std.fmt.parseInt(u8, hash[10..12], 16) catch unreachable;

    const r = lerp(baseR, nextR, t);
    const g = lerp(baseG, nextG, t);
    const b = lerp(baseB, nextB, t);

    return [_]u8{ r, g, b, 255 };
}

pub fn main() !void {
    initializeCrc32Table();

    const allocator = std.heap.page_allocator;
    const width: u32 = 100;
    const height: u32 = 100;
    const hash = "1a2b3c4d5e6f";

    var header = [_]u8{ 137, 80, 78, 71, 13, 10, 26, 10 };

    var ihdr: [25]u8 = undefined;
    std.mem.writeIntBig(u32, ihdr[0..4], 13);
    std.mem.copy(u8, ihdr[4..8], "IHDR");
    std.mem.writeIntBig(u32, ihdr[8..12], width);
    std.mem.writeIntBig(u32, ihdr[12..16], height);
    ihdr[16] = 8; // Bit depth
    ihdr[17] = 2; // Color type; RGB
    std.mem.copy(u8, ihdr[18..21], &[_]u8{ 0, 0, 0 });
    std.mem.writeIntBig(u32, ihdr[21..25], crc32(ihdr[4..21]));

    var rng = std.rand.Xoroshiro128.init(12345);
    _ = rng;
    var pixels = try allocator.alloc(u8, height * (width * 3 + 1));
    defer allocator.free(pixels);

    var y: u32 = 0;
    while (y < height) : (y += 1) {
        var x: u32 = 0;
        while (x < width) : (x += 1) {
            const t: f32 = (@as(f32, @floatFromInt(y)) / @as(f32, @floatFromInt(height)) + @as(f32, @floatFromInt(x)) / @as(f32, @floatFromInt(width))) / 2.0;
            const color = generateColor(hash, t);

            const r = color[0];
            const g = color[1];
            const b = color[2];

            const idx = y * (width * 3 + 1) + 1 + x * 3;
            pixels[idx] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
        }
    }

    var compressed_len: c.ulong = pixels.len * 2;
    var compressed = try allocator.alloc(u8, compressed_len);
    defer allocator.free(compressed);

    _ = c.compress(compressed.ptr, &compressed_len, pixels.ptr, @as(c.ulong, @intCast(pixels.len)));

    var idat = try allocator.alloc(u8, compressed_len + 12);
    defer allocator.free(idat);

    std.mem.writeIntBig(u32, idat[0..4], @as(u32, @intCast(compressed_len)));
    std.mem.copy(u8, idat[4..8], "IDAT");
    std.mem.copy(u8, idat[8 .. 8 + compressed_len], compressed[0..compressed_len]);
    std.mem.writeIntBig(u32, @as(*[4]u8, @ptrCast(idat[8 + compressed_len .. 12 + compressed_len])), crc32(idat[4 .. 8 + compressed_len]));

    var iend: [12]u8 = [_]u8{ 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130 };

    const file = try fs.cwd().createFile("image.png", .{});
    defer file.close();

    try file.writeAll(&header);
    try file.writeAll(&ihdr);
    try file.writeAll(idat[0 .. compressed_len + 12]);
    try file.writeAll(&iend);
}
