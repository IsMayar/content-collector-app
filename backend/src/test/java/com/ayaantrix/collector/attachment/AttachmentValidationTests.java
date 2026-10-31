package com.ayaantrix.collector.attachment;

import static org.assertj.core.api.Assertions.*;

import com.ayaantrix.collector.attachment.dto.AttachmentDtos.Reserve;
import com.ayaantrix.collector.attachment.service.AttachmentValidationService;
import com.ayaantrix.collector.common.error.ApiException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import tools.jackson.databind.json.JsonMapper;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.zip.*;

class AttachmentValidationTests {
    private final AttachmentValidationService validation = new AttachmentValidationService();
    private final JsonMapper json = JsonMapper.builder().build();

    private Reserve input(String name, String type, long size) {
        return new Reserve(UUID.randomUUID(), name, type, size, true);
    }

    private tools.jackson.databind.JsonNode field(String type) {
        return json.readTree("{\"type\":\"" + type + "\",\"validation\":{}}");
    }

    private void denied(Runnable work, String code) {
        assertThatThrownBy(work::run)
                .isInstanceOfSatisfying(
                        ApiException.class, e -> assertThat(e.getCode()).isEqualTo(code));
    }

    @ParameterizedTest
    @CsvSource({
        "notes.txt,text/plain",
        "picture.png,image/png",
        "picture.jpeg,image/jpeg",
        "guide.pdf,application/pdf",
        "logo.svg,image/svg+xml",
        "guide.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    })
    void supportedDeclarationsReserveOnlyBoundedBytes(String name, String mime) {
        long result = validation.validate(input(name, mime, 100), field("FILE"));
        assertThat(result).isEqualTo(100 + (validation.image(mime) ? 32 * 1048576L : 0));
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "malware.exe",
                "archive.zip",
                "script.js",
                "script.html",
                "image.webp",
                "image.heic",
                "image.heif",
                "archive.tar"
            })
    void unverifiedOrExecutableFormatsAreNotAdvertised(String name) {
        denied(
                () ->
                        validation.validate(
                                input(name, "application/octet-stream", 100), field("FILE")),
                "FILE_TYPE_NOT_ALLOWED");
    }

    @ParameterizedTest
    @ValueSource(
            strings = {"../notes.txt", "folder/notes.txt", "folder\\notes.txt", "bad\nname.txt"})
    void filenamesCannotSelectPaths(String name) {
        denied(
                () -> validation.validate(input(name, "text/plain", 100), field("FILE")),
                "INVALID_FILENAME");
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1, 104857601})
    void documentSizeIsServerValidated(long bytes) {
        denied(
                () -> validation.validate(input("notes.txt", "text/plain", bytes), field("FILE")),
                "FILE_SIZE_INVALID");
    }

    @Test
    void imageLimitIsLowerThanDocumentLimit() {
        denied(
                () ->
                        validation.validate(
                                input("photo.png", "image/png", 52428801), field("IMAGE")),
                "FILE_SIZE_INVALID");
    }

    @Test
    void declaredMimeMustAgreeWithExtension() {
        denied(
                () -> validation.validate(input("photo.png", "text/plain", 100), field("FILE")),
                "FILE_TYPE_NOT_ALLOWED");
    }

    @Test
    void nonFileQuestionsCannotReserve() {
        denied(
                () ->
                        validation.validate(
                                input("notes.txt", "text/plain", 100), field("SHORT_TEXT")),
                "FILE_FIELD_REQUIRED");
    }

    @Test
    void documentsCannotBeUsedAsImageAnswers() {
        denied(
                () -> validation.validate(input("notes.txt", "text/plain", 100), field("IMAGE")),
                "FILE_TYPE_NOT_ALLOWED");
    }

    @Test
    void emptyBodyIsRejected() {
        denied(() -> validation.verify(new byte[0], "text/plain"), "EMPTY_FILE");
    }

    @ParameterizedTest
    @ValueSource(strings = {"#!/bin/sh\necho unsafe", "<!DOCTYPE html><html/>", "bad\u0000text"})
    void activeTextIsRejected(String text) {
        denied(
                () -> validation.verify(text.getBytes(StandardCharsets.UTF_8), "text/plain"),
                "CONTENT_TYPE_MISMATCH");
    }

    @Test
    void plainTextMustBeUtf8() {
        denied(() -> validation.verify(new byte[] {(byte) 0xff}, "text/plain"), "INVALID_FILE");
    }

    @Test
    void imageSignaturesCannotBeSpoofedByFilename() {
        denied(
                () ->
                        validation.verify(
                                "synthetic plain text".getBytes(StandardCharsets.UTF_8),
                                "image/png"),
                "CONTENT_TYPE_MISMATCH");
    }

    @Test
    void svgScriptsAreRejected() {
        denied(
                () ->
                        validation.verify(
                                "<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"
                                        .getBytes(StandardCharsets.UTF_8),
                                "image/svg+xml"),
                "ACTIVE_CONTENT");
    }

    @Test
    void svgExternalEntitiesAreRejected() {
        denied(
                () ->
                        validation.verify(
                                "<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///synthetic'>]><svg xmlns='http://www.w3.org/2000/svg'>&x;</svg>"
                                        .getBytes(StandardCharsets.UTF_8),
                                "image/svg+xml"),
                "INVALID_FILE");
    }

    @Test
    void validSvgIsOnlyAnAttachment() {
        assertThatCode(
                        () ->
                                validation.verify(
                                        "<svg xmlns='http://www.w3.org/2000/svg'><rect width='10' height='10'/></svg>"
                                                .getBytes(StandardCharsets.UTF_8),
                                        "image/svg+xml"))
                .doesNotThrowAnyException();
    }

    @Test
    void arbitraryZipCannotMasqueradeAsDocx() throws Exception {
        var out = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("notes.txt"));
            zip.write("synthetic".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        denied(
                () ->
                        validation.verify(
                                out.toByteArray(),
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                "INVALID_DOCUMENT");
    }

    @Test
    void encryptedPdfIsRejected() throws Exception {
        var out = new ByteArrayOutputStream();
        try (var doc = new org.apache.pdfbox.pdmodel.PDDocument()) {
            doc.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            doc.protect(
                    new org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy(
                            "owner-synthetic",
                            "reader-synthetic",
                            new org.apache.pdfbox.pdmodel.encryption.AccessPermission()));
            doc.save(out);
        }
        denied(() -> validation.verify(out.toByteArray(), "application/pdf"), "ENCRYPTED_FILE");
    }

    @Test
    void validPdfParsesWithoutRenderingOrExecutingContent() throws Exception {
        var out = new ByteArrayOutputStream();
        try (var doc = new org.apache.pdfbox.pdmodel.PDDocument()) {
            doc.addPage(new org.apache.pdfbox.pdmodel.PDPage());
            doc.save(out);
        }
        assertThatCode(() -> validation.verify(out.toByteArray(), "application/pdf"))
                .doesNotThrowAnyException();
    }

    @Test
    void constrainedDocxContainerIsAccepted() throws Exception {
        var out = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("[Content_Types].xml"));
            zip.write(
                    "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'><Default Extension='xml' ContentType='application/xml'/><Override PartName='/word/document.xml' ContentType='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'/></Types>"
                            .getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("word/document.xml"));
            zip.write(
                    "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'><w:body><w:p/></w:body></w:document>"
                            .getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        assertThatCode(
                        () ->
                                validation.verify(
                                        out.toByteArray(),
                                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
                .doesNotThrowAnyException();
    }

    @Test
    void namespacedSvgScriptsCannotBypassParsedContentChecks() {
        denied(
                () ->
                        validation.verify(
                                "<svg xmlns='http://www.w3.org/2000/svg' xmlns:x='http://www.w3.org/2000/svg'><x:script/></svg>"
                                        .getBytes(StandardCharsets.UTF_8),
                                "image/svg+xml"),
                "ACTIVE_CONTENT");
    }

    @Test
    void svgExternalResourceReferencesAreRejected() {
        denied(
                () ->
                        validation.verify(
                                "<svg xmlns='http://www.w3.org/2000/svg'><image href='https://example.test/private-tracker'/></svg>"
                                        .getBytes(StandardCharsets.UTF_8),
                                "image/svg+xml"),
                "ACTIVE_CONTENT");
    }

    @Test
    void fabricatedDocxManifestAndBodyAreRejected() throws Exception {
        var out = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(out)) {
            for (String name : java.util.List.of("[Content_Types].xml", "word/document.xml")) {
                zip.putNextEntry(new ZipEntry(name));
                zip.write("<fabricated/>".getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        denied(
                () ->
                        validation.verify(
                                out.toByteArray(),
                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
                "INVALID_DOCUMENT");
    }
}
