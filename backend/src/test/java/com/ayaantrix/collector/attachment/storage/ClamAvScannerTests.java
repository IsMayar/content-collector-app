package com.ayaantrix.collector.attachment.storage;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;

class ClamAvScannerTests {
    void scan(String reply, Class<? extends Throwable> expected) throws Exception {
        try (var server = new ServerSocket(0, 1, InetAddress.getLoopbackAddress());
                var executor = Executors.newSingleThreadExecutor()) {
            server.setSoTimeout(5000);
            var exchange =
                    executor.submit(
                            () -> {
                                try (var socket = server.accept()) {
                                    socket.setSoTimeout(5000);
                                    var input = new DataInputStream(socket.getInputStream());
                                    assertThat(input.readNBytes(10))
                                            .isEqualTo(
                                                    "zINSTREAM\0"
                                                            .getBytes(StandardCharsets.US_ASCII));
                                    for (int n; (n = input.readInt()) != 0; ) {
                                        assertThat(n).isBetween(1, 8192);
                                        assertThat(input.readNBytes(n)).hasSize(n);
                                    }
                                    socket.getOutputStream()
                                            .write(reply.getBytes(StandardCharsets.US_ASCII));
                                    socket.getOutputStream().flush();
                                }
                                return true;
                            });
            var scanner =
                    new ClamAvScanner(
                            new MockEnvironment()
                                    .withProperty(
                                            "CLAMAV_HOST", server.getInetAddress().getHostAddress())
                                    .withProperty(
                                            "CLAMAV_PORT",
                                            Integer.toString(server.getLocalPort())));
            if (expected == null)
                assertThatCode(() -> scanner.verify(new byte[] {1, 2, 3}))
                        .doesNotThrowAnyException();
            else
                assertThatThrownBy(() -> scanner.verify(new byte[] {1, 2, 3}))
                        .isInstanceOf(expected);
            assertThat(exchange.get(5, TimeUnit.SECONDS)).isTrue();
        }
    }

    @Test
    void acceptsOnlyAnExplicitFramedCleanVerdict() throws Exception {
        scan("stream: OK\0", null);
    }

    @Test
    void framedMalwareVerdictIsRejected() throws Exception {
        scan("stream: Synthetic.Signature FOUND\0", ClamAvScanner.Infected.class);
    }

    @ParameterizedTest
    @ValueSource(
            strings = {"stream: OK", "stream: OK\n", "", "stream: ERROR\0", "stream: OK extra\0"})
    void incompleteOrUnexpectedVerdictsFailClosed(String reply) throws Exception {
        scan(reply, ClamAvScanner.ScanUnavailable.class);
    }

    @Test
    void oversizedVerdictFailsClosed() throws Exception {
        scan("x".repeat(1025) + "\0", ClamAvScanner.ScanUnavailable.class);
    }
}
