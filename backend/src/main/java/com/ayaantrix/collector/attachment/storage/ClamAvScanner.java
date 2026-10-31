package com.ayaantrix.collector.attachment.storage;

import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

@Component
public class ClamAvScanner implements MalwareScanner {
    private final String host;
    private final int port;

    public ClamAvScanner(Environment env) {
        host = env.getProperty("CLAMAV_HOST", "");
        port = env.getProperty("CLAMAV_PORT", Integer.class, 3310);
    }

    public void verify(byte[] bytes) {
        if (host.isBlank()) throw new ScanUnavailable();
        try (var socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 5000);
            socket.setSoTimeout(30000);
            var out = new DataOutputStream(socket.getOutputStream());
            out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));
            for (int off = 0; off < bytes.length; off += 8192) {
                int count = Math.min(8192, bytes.length - off);
                out.writeInt(count);
                out.write(bytes, off, count);
            }
            out.writeInt(0);
            out.flush();
            var in = socket.getInputStream();
            var response = new ByteArrayOutputStream();
            for (int c; (c = in.read()) != -1 && c != 0 && response.size() < 1024; )
                response.write(c);
            String result = response.toString(StandardCharsets.US_ASCII);
            if (result.endsWith(" FOUND")) throw new Infected();
            if (!result.equals("stream: OK")) throw new ScanUnavailable();
        } catch (IOException e) {
            throw new ScanUnavailable();
        }
    }

    public static final class Infected extends RuntimeException {}

    public static final class ScanUnavailable extends RuntimeException {}
}
