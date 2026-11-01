package com.ayaantrix.collector.attachment.storage;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.*;
import java.nio.ByteBuffer;
import java.nio.file.*;
import java.util.Arrays;
import java.util.zip.CRC32;

class SandboxedImageProcessorTests {
    @TempDir Path directory;

    @Test
    void readsAnActualBoundedPngOutput() throws Exception {
        byte[] png = png(1, 1);
        Path output = directory.resolve("working.png");
        Files.write(output, png);
        assertThat(SandboxedImageProcessor.readOutput(output)).isEqualTo(png);
    }

    @Test
    void rejectsDirectoriesAndNonImageWorkerResults() throws Exception {
        assertThatThrownBy(() -> SandboxedImageProcessor.readOutput(directory))
                .isInstanceOf(java.io.IOException.class);
        Path output = directory.resolve("working.png");
        Files.writeString(output, "not a decoded PNG");
        assertThatThrownBy(() -> SandboxedImageProcessor.readOutput(output))
                .isInstanceOf(java.io.IOException.class);
    }

    @Test
    void oversizedWorkerOutputIsNotLoadedIntoMemory() throws Exception {
        Path output = directory.resolve("working.png");
        try (var channel =
                java.nio.channels.FileChannel.open(
                        output, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            channel.position(32 * 1048576L);
            channel.write(java.nio.ByteBuffer.wrap(new byte[] {0}));
        }
        assertThatThrownBy(() -> SandboxedImageProcessor.readOutput(output))
                .isInstanceOf(java.io.IOException.class);
    }

    static byte[] png(int width, int height) throws Exception {
        var image =
                new java.awt.image.BufferedImage(
                        width, height, java.awt.image.BufferedImage.TYPE_INT_ARGB);
        var out = new ByteArrayOutputStream();
        javax.imageio.ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    void rejected(byte[] bytes, int edge) throws Exception {
        Path output = directory.resolve("variant.png");
        Files.write(output, bytes);
        assertThatThrownBy(() -> SandboxedImageProcessor.readOutput(output, edge))
                .isInstanceOf(IOException.class);
    }

    @Test
    void thumbnailHasItsOwnSmallerDimensionLimit() throws Exception {
        byte[] bytes = png(481, 1);
        Path output = directory.resolve("working.png");
        Files.write(output, bytes);
        assertThat(SandboxedImageProcessor.readOutput(output, 2560)).isEqualTo(bytes);
        rejected(bytes, 480);
    }

    @Test
    void acceptsWorkingAndThumbnailAtTheirExactBounds() throws Exception {
        for (int edge : new int[] {2560, 480}) {
            byte[] bytes = png(edge, 1);
            Path output = directory.resolve("variant.png");
            Files.write(output, bytes);
            assertThat(SandboxedImageProcessor.readOutput(output, edge)).isEqualTo(bytes);
        }
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = {0, -1, 2561, Integer.MAX_VALUE})
    void rejectsInvalidOrOversizedDimensionsEvenWithValidHeaderCrc(int width) throws Exception {
        byte[] bytes = png(1, 1);
        ByteBuffer.wrap(bytes).putInt(16, width);
        var crc = new CRC32();
        crc.update(bytes, 12, 17);
        ByteBuffer.wrap(bytes).putInt(29, (int) crc.getValue());
        rejected(bytes, 2560);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(
            strings = {"eXIf", "tEXt", "zTXt", "iTXt", "acTL"})
    void rejectsMetadataAndAnimationRatherThanPublishingIt(String type) throws Exception {
        byte[] bytes = png(1, 1);
        var out = new ByteArrayOutputStream();
        out.write(bytes, 0, 33);
        var chunk = new DataOutputStream(out);
        byte[] payload =
                "synthetic location metadata".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        chunk.writeInt(payload.length);
        byte[] name = type.getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        chunk.write(name);
        chunk.write(payload);
        var crc = new CRC32();
        crc.update(name);
        crc.update(payload);
        chunk.writeInt((int) crc.getValue());
        out.write(bytes, 33, bytes.length - 33);
        rejected(out.toByteArray(), 2560);
    }

    @Test
    void rejectsTruncatedChunkAndTrailingData() throws Exception {
        byte[] bytes = png(1, 1);
        rejected(Arrays.copyOf(bytes, bytes.length - 1), 2560);
        rejected(Arrays.copyOf(bytes, bytes.length + 1), 2560);
    }

    @Test
    void rejectsCorruptChunkCrc() throws Exception {
        byte[] bytes = png(1, 1);
        bytes[29] ^= 1;
        rejected(bytes, 2560);
    }

    @Test
    void rejectsChunkLengthOverflowWithoutAllocatingDeclaredSize() throws Exception {
        byte[] bytes = png(1, 1);
        ByteBuffer.wrap(bytes).putInt(8, Integer.MAX_VALUE);
        rejected(bytes, 2560);
    }
}
