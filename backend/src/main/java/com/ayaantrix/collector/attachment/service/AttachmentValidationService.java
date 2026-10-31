package com.ayaantrix.collector.attachment.service;

import com.ayaantrix.collector.attachment.dto.AttachmentDtos.Reserve;
import com.ayaantrix.collector.common.error.ApiException;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import tools.jackson.databind.JsonNode;

import java.io.*;
import java.nio.*;
import java.nio.charset.*;
import java.util.*;
import java.util.zip.*;

import javax.xml.parsers.DocumentBuilderFactory;

@Component
public class AttachmentValidationService {
    public static final long MIB = 1048576L;
    public static final Map<String, String> TYPES =
            Map.of(
                    "jpg",
                    "image/jpeg",
                    "jpeg",
                    "image/jpeg",
                    "png",
                    "image/png",
                    "pdf",
                    "application/pdf",
                    "docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "txt",
                    "text/plain",
                    "svg",
                    "image/svg+xml");

    public static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    public boolean image(String type) {
        return type.equals("image/jpeg") || type.equals("image/png");
    }

    public long validate(Reserve input, JsonNode item) {
        String name = input.originalName();
        if (name.isBlank()
                || name.length() > 250
                || name.chars().anyMatch(c -> c < 32 || c == 127)
                || name.contains("/")
                || name.contains("\\"))
            invalid("INVALID_FILENAME", "Use a filename without folders or control characters.");
        String ext = extension(name), type = TYPES.get(ext);
        if (type == null || !type.equals(input.contentType()))
            invalid(
                    "FILE_TYPE_NOT_ALLOWED",
                    "The file extension and media type must be supported and agree.");
        if (input.bytes() == null
                || input.bytes() <= 0
                || input.bytes() > (image(type) ? 50 * MIB : 100 * MIB))
            invalid(
                    "FILE_SIZE_INVALID",
                    "Images must be 1 byte to 50 MiB; documents 1 byte to 100 MiB.");
        String field = item.path("type").asText();
        if (!Set.of("FILE", "IMAGE", "REPEATER").contains(field))
            invalid("FILE_FIELD_REQUIRED", "This question does not accept files.");
        if (field.equals("IMAGE") && !image(type))
            invalid("FILE_TYPE_NOT_ALLOWED", "Choose a supported image for this question.");
        if (field.equals("REPEATER")) {
            boolean found = false;
            for (var c : item.path("validation").path("columns"))
                found |= c.path("type").asText().equals("IMAGE");
            if (!found || !image(type))
                invalid(
                        "FILE_FIELD_REQUIRED",
                        "This repeating question does not accept this file.");
        } else {
            var allowed = item.path("validation").path("allowedExtensions");
            if (allowed.isArray() && !allowed.isEmpty()) {
                boolean found = false;
                for (var e : allowed)
                    found |=
                            e.asText().equalsIgnoreCase(ext)
                                    || (e.asText().equals("jpg") && ext.equals("jpeg"))
                                    || (e.asText().equals("jpeg") && ext.equals("jpg"));
                if (!found)
                    invalid(
                            "FILE_TYPE_NOT_ALLOWED",
                            "This question does not allow this file extension.");
            }
        }
        if (!image(type) && !input.keepOriginal())
            invalid("ORIGINAL_REQUIRED", "Documents are kept in their original format.");
        return input.bytes() + (image(type) ? 32 * MIB : 0);
    }

    public void verify(byte[] bytes, String type) {
        if (bytes.length == 0) invalid("EMPTY_FILE", "The uploaded file is empty.");
        try {
            switch (type) {
                case "image/png" -> {
                    if (bytes.length < 24
                            || bytes[0] != (byte) 137
                            || bytes[1] != 80
                            || bytes[2] != 78
                            || bytes[3] != 71)
                        invalid("CONTENT_TYPE_MISMATCH", "The file is not a PNG image.");
                    dimensions(bytes);
                }
                case "image/jpeg" -> {
                    if (bytes.length < 4
                            || bytes[0] != (byte) 255
                            || bytes[1] != (byte) 216
                            || bytes[2] != (byte) 255)
                        invalid("CONTENT_TYPE_MISMATCH", "The file is not a JPEG image.");
                    dimensions(bytes);
                }
                case "application/pdf" -> {
                    if (!new String(bytes, 0, Math.min(5, bytes.length), StandardCharsets.US_ASCII)
                            .equals("%PDF-"))
                        invalid("CONTENT_TYPE_MISMATCH", "The file is not a PDF.");
                    try (var doc = org.apache.pdfbox.Loader.loadPDF(bytes)) {
                        if (doc.isEncrypted())
                            invalid("ENCRYPTED_FILE", "Password-protected files are not accepted.");
                    } catch (org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException e) {
                        invalid("ENCRYPTED_FILE", "Password-protected files are not accepted.");
                    }
                }
                case "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ->
                        docx(bytes);
                case "image/svg+xml" -> {
                    var root = xml(bytes).getDocumentElement();
                    if (!root.getLocalName().equals("svg"))
                        invalid("CONTENT_TYPE_MISMATCH", "The file is not an SVG.");
                    String text =
                            new String(bytes, StandardCharsets.UTF_8).toLowerCase(Locale.ROOT);
                    if (text.contains("<script") || text.matches("(?s).*\\son[a-z]+\\s*=.*"))
                        invalid("ACTIVE_CONTENT", "Active SVG content is not accepted.");
                }
                case "text/plain" -> {
                    String t =
                            StandardCharsets.UTF_8
                                    .newDecoder()
                                    .onMalformedInput(CodingErrorAction.REPORT)
                                    .decode(ByteBuffer.wrap(bytes))
                                    .toString();
                    if (t.indexOf(0) >= 0
                            || t.stripLeading().startsWith("#!")
                            || t.stripLeading()
                                    .toLowerCase(Locale.ROOT)
                                    .startsWith("<!doctype html"))
                        invalid("CONTENT_TYPE_MISMATCH", "Choose a plain UTF-8 text document.");
                }
                default -> invalid("FILE_TYPE_NOT_ALLOWED", "Unsupported file type.");
            }
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            invalid("INVALID_FILE", "This file could not be safely verified.");
        }
    }

    private void dimensions(byte[] bytes) throws IOException {
        try (var stream =
                javax.imageio.ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = javax.imageio.ImageIO.getImageReaders(stream);
            if (!readers.hasNext())
                invalid("DECODER_UNAVAILABLE", "No verified decoder is available for this format.");
            var reader = readers.next();
            try {
                reader.setInput(stream);
                long w = reader.getWidth(0), h = reader.getHeight(0);
                if (w <= 0 || h <= 0 || w * h > 50000000L)
                    invalid(
                            "IMAGE_PIXEL_LIMIT",
                            "Images must contain at most 50 million decoded pixels.");
            } finally {
                reader.dispose();
            }
        }
    }

    private org.w3c.dom.Document xml(byte[] bytes) throws Exception {
        var f = DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);
        f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        f.setFeature("http://xml.org/sax/features/external-general-entities", false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        f.setAttribute("http://javax.xml.XMLConstants/property/accessExternalDTD", "");
        f.setAttribute("http://javax.xml.XMLConstants/property/accessExternalSchema", "");
        var builder = f.newDocumentBuilder();
        builder.setErrorHandler(new org.xml.sax.helpers.DefaultHandler());
        return builder.parse(new ByteArrayInputStream(bytes));
    }

    private void docx(byte[] bytes) throws Exception {
        boolean content = false, document = false;
        long total = 0;
        int entries = 0;
        var names = new HashSet<String>();
        try (var zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry e; (e = zip.getNextEntry()) != null; ) {
                String name = e.getName();
                if (++entries > 1000
                        || name.contains("..")
                        || name.startsWith("/")
                        || name.contains("\\")
                        || !names.add(name))
                    invalid("INVALID_DOCUMENT", "Unsafe document container.");
                String lower = name.toLowerCase(Locale.ROOT);
                if (lower.endsWith(".bin")
                        || lower.contains("vbaproject")
                        || lower.startsWith("word/embeddings/"))
                    invalid(
                            "ACTIVE_CONTENT",
                            "Embedded executable objects and macros are not accepted.");
                var out = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                for (int n; (n = zip.read(buffer)) > 0; ) {
                    total += n;
                    if (total > 100 * MIB)
                        invalid(
                                "DOCUMENT_EXPANSION_LIMIT",
                                "The document expands beyond the safe processing limit.");
                    if (name.endsWith(".xml") || name.endsWith(".rels")) {
                        if (out.size() + n > 10 * MIB)
                            invalid(
                                    "DOCUMENT_EXPANSION_LIMIT",
                                    "A document XML part exceeds the processing limit.");
                        out.write(buffer, 0, n);
                    }
                }
                if (out.size() > 0) {
                    var part = out.toByteArray();
                    xml(part);
                    if (new String(part, StandardCharsets.UTF_8).contains("macroEnabled"))
                        invalid("ACTIVE_CONTENT", "Macros are not accepted.");
                }
                content |= name.equals("[Content_Types].xml");
                document |= name.equals("word/document.xml");
            }
        }
        if (!content || !document)
            invalid("INVALID_DOCUMENT", "The file is not a valid DOCX document.");
    }

    public static void invalid(String code, String text) {
        throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, code, text);
    }
}
