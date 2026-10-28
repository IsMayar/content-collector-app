package com.ayaantrix.collector.template.validation;

import org.springframework.stereotype.Component;
import tools.jackson.core.StreamReadFeature;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Schema v1 structural validation only; never interprets examples as client answers. */
@Component
public class TemplateSchemaValidator {
    private final JsonMapper json = JsonMapper.builder()
        .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    public record Diagnostic(String fieldPath, String code) {}
    public static final class InvalidTemplate extends IllegalArgumentException {
        private final Diagnostic diagnostic;
        InvalidTemplate(String path, String code) {
            super("Invalid template structure: " + code); diagnostic = new Diagnostic(path, code);
        }
        public Diagnostic diagnostic() { return diagnostic; }
    }
    public JsonNode parse(String source) {
        if (source == null || source.getBytes(StandardCharsets.UTF_8).length > 1_048_576) fail("$", "JSON_SIZE");
        try { return json.readTree(source); }
        catch (RuntimeException invalid) { throw new InvalidTemplate("$", "MALFORMED_JSON"); }
    }
    public JsonNode validate(String source) { return validate(parse(source)); }
    public JsonNode validate(JsonNode root) {
        object(root, "$", "schemaVersion version key projectType industry title sections");
        if (root.toString().getBytes(StandardCharsets.UTF_8).length > 1_048_576) fail("$", "JSON_SIZE");
        integer(root, "schemaVersion", "$", 1, 1, true);
        integer(root, "version", "$", 1, Integer.MAX_VALUE, false);
        key(root, "$", 160); text(root, "title", "$", 160, true);
        text(root, "industry", "$", 80, true);
        choice(root, "projectType", "$", Set.of("WEBSITE", "WEB_APP", "MOBILE_APP"));
        var sections = array(root, "sections", "$", 1, 30);
        var sectionKeys = new HashSet<String>(); var itemKeys = new HashSet<String>(); int total = 0;
        for (int si = 0; si < sections.size(); si++) {
            String path = "$.sections[" + si + "]"; var section = sections.get(si);
            object(section, path, "key title items"); unique(sectionKeys, key(section, path, 160), path + ".key");
            text(section, "title", path, 200, true);
            var items = array(section, "items", path, 1, 50); total += items.size();
            if (total > 300) fail("$.sections", "ITEM_LIMIT");
            var earlier = new HashMap<String, JsonNode>();
            for (int ii = 0; ii < items.size(); ii++) {
                String ip = path + ".items[" + ii + "]"; var item = items.get(ii);
                item(item, ip); String key = key(item, ip, 200); unique(itemKeys, key, ip + ".key");
                if (item.has("visibleWhen")) {
                    var condition = item.get("visibleWhen"); String cp = ip + ".visibleWhen";
                    object(condition, cp, "dependsOnItemKey operator optionKey");
                    text(condition, "dependsOnItemKey", cp, 200, true); text(condition, "optionKey", cp, 160, true);
                    choice(condition, "operator", cp, Set.of("EQUALS"));
                    var dependency = earlier.get(condition.get("dependsOnItemKey").asText());
                    if (dependency == null || !dependency.get("type").asText().equals("SINGLE_SELECT")) fail(cp, "EARLIER_SINGLE_SELECT_REQUIRED");
                    boolean exists = false;
                    for (var option : dependency.get("validation").get("options"))
                        if (option.get("key").asText().equals(condition.get("optionKey").asText())) exists = true;
                    if (!exists) fail(cp + ".optionKey", "UNKNOWN_OPTION");
                }
                earlier.put(key, item);
            }
        }
        return root.deepCopy();
    }
    private void item(JsonNode n, String p) {
        object(n, p, "key label type instructions example required validation enabled ai visibleWhen");
        key(n, p, 200); text(n, "label", p, 250, true); text(n, "instructions", p, 10000, false); text(n, "example", p, 10000, false);
        bool(n, "required", p, true); bool(n, "enabled", p, false);
        String type = choice(n, "type", p, Set.of("SHORT_TEXT", "LONG_TEXT", "URL", "SINGLE_SELECT", "MULTI_SELECT", "IMAGE", "FILE", "REPEATER"));
        var v = n.get("validation"); String vp = p + ".validation";
        String allowed = switch (type) {
            case "SHORT_TEXT" -> "minLength maxLength format";
            case "LONG_TEXT" -> "minLength maxLength";
            case "URL" -> "allowedSchemes";
            case "SINGLE_SELECT" -> "options";
            case "MULTI_SELECT" -> "options minOptions maxOptions";
            case "IMAGE", "FILE" -> "minFiles maxFiles allowedExtensions";
            case "REPEATER" -> "maxRows columns";
            default -> throw new IllegalStateException();
        };
        object(v, vp, allowed);
        switch (type) {
            case "SHORT_TEXT", "LONG_TEXT" -> {
                int cap = type.equals("SHORT_TEXT") ? 200 : 10000;
                integer(v, "maxLength", vp, 1, cap, true); integer(v, "minLength", vp, 0, cap, false);
                bounds(v, "minLength", "maxLength", vp);
                if (v.has("format")) choice(v, "format", vp, Set.of("email"));
            }
            case "URL" -> strings(v, "allowedSchemes", vp, Set.of("http", "https"));
            case "SINGLE_SELECT", "MULTI_SELECT" -> {
                options(v, vp);
                if (type.equals("MULTI_SELECT")) {
                    int count = v.get("options").size();
                    integer(v, "minOptions", vp, 0, count, false); integer(v, "maxOptions", vp, 1, count, true);
                    bounds(v, "minOptions", "maxOptions", vp);
                }
            }
            case "IMAGE", "FILE" -> {
                integer(v, "minFiles", vp, 0, 50, false); integer(v, "maxFiles", vp, 1, 50, true);
                bounds(v, "minFiles", "maxFiles", vp);
                if (v.has("allowedExtensions")) {
                    strings(v, "allowedExtensions", vp, null);
                    for (var ext : v.get("allowedExtensions")) if (!ext.asText().matches("[a-z0-9]{1,12}")) fail(vp + ".allowedExtensions", "INVALID_EXTENSION");
                }
            }
            case "REPEATER" -> {
                integer(v, "maxRows", vp, 1, 20, true); var columns = array(v, "columns", vp, 1, 8); var keys = new HashSet<String>();
                for (int i = 0; i < columns.size(); i++) {
                    String cp = vp + ".columns[" + i + "]"; var c = columns.get(i);
                    object(c, cp, "key label type required options"); unique(keys, key(c, cp, 160), cp + ".key");
                    text(c, "label", cp, 250, true); bool(c, "required", cp, true);
                    String ct = choice(c, "type", cp, Set.of("SHORT_TEXT", "LONG_TEXT", "URL", "NUMBER", "SINGLE_SELECT", "IMAGE"));
                    if (ct.equals("SINGLE_SELECT")) options(c, cp);
                    else if (c.has("options")) fail(cp + ".options", "INAPPLICABLE_PROPERTY");
                }
            }
            default -> throw new IllegalStateException();
        }
        if (n.has("ai")) {
            var ai = n.get("ai"); String ap = p + ".ai"; object(ai, ap, "enabled targetWords");
            if (!type.equals("LONG_TEXT")) fail(ap, "AI_LONG_TEXT_ONLY");
            bool(ai, "enabled", ap, true); integer(ai, "targetWords", ap, 1, 10000, true);
        }
    }
    private void options(JsonNode n, String p) {
        var options = array(n, "options", p, 1, 100); var keys = new HashSet<String>();
        for (int i = 0; i < options.size(); i++) {
            String op = p + ".options[" + i + "]"; var option = options.get(i); object(option, op, "key label");
            unique(keys, key(option, op, 160), op + ".key"); text(option, "label", op, 250, true);
        }
    }
    private static void object(JsonNode n, String p, String allowed) {
        if (n == null || !n.isObject()) fail(p, "OBJECT_REQUIRED");
        var keys = Set.of(allowed.split(" "));
        for (String key : n.propertyNames()) if (!keys.contains(key)) fail(p, "UNSUPPORTED_PROPERTY");
    }
    private static String key(JsonNode n, String p, int cap) {
        text(n, "key", p, cap, true); String key = n.get("key").asText();
        if (!key.matches("[a-zA-Z0-9][a-zA-Z0-9_.-]*")) fail(p + ".key", "INVALID_KEY"); return key;
    }
    private static void text(JsonNode n, String field, String p, int cap, boolean nonblank) {
        var v = n.get(field);
        if (v == null || !v.isString() || v.asText().length() > cap || (nonblank && v.asText().isBlank())) fail(p + "." + field, "INVALID_TEXT");
    }
    private static void bool(JsonNode n, String field, String p, boolean required) {
        if ((required || n.has(field)) && (n.get(field) == null || !n.get(field).isBoolean())) fail(p + "." + field, "BOOLEAN_REQUIRED");
    }
    private static void integer(JsonNode n, String f, String p, int min, int max, boolean required) {
        if (!required && !n.has(f)) return;
        var v = n.get(f); if (v == null || !v.isIntegralNumber() || !v.canConvertToInt() || v.asInt() < min || v.asInt() > max) fail(p + "." + f, "INTEGER_RANGE");
    }
    private static String choice(JsonNode n, String f, String p, Set<String> values) {
        var v = n.get(f); if (v == null || !v.isString() || !values.contains(v.asText())) fail(p + "." + f, "UNSUPPORTED_VALUE"); return v.asText();
    }
    private static JsonNode array(JsonNode n, String f, String p, int min, int max) {
        var v = n.get(f); if (v == null || !v.isArray() || v.size() < min || v.size() > max) fail(p + "." + f, "ARRAY_SIZE"); return v;
    }
    private static void strings(JsonNode n, String f, String p, Set<String> values) {
        var a = array(n, f, p, 1, 100); var seen = new HashSet<String>();
        for (var v : a) {
            if (!v.isString() || v.asText().isBlank() || v.asText().length() > 160 || (values != null && !values.contains(v.asText()))) fail(p + "." + f, "INVALID_STRING_CHOICE");
            unique(seen, v.asText(), p + "." + f);
        }
    }
    private static void bounds(JsonNode n, String min, String max, String p) {
        if (n.has(min) && n.get(min).asInt() > n.get(max).asInt()) fail(p, "INVERTED_BOUNDS");
    }
    private static void unique(Set<String> seen, String key, String p) { if (!seen.add(key)) fail(p, "DUPLICATE_KEY"); }
    private static void fail(String p, String code) { throw new InvalidTemplate(p, code); }
}
