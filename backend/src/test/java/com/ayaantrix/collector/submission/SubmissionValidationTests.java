package com.ayaantrix.collector.submission;

import static org.assertj.core.api.Assertions.*;

import com.ayaantrix.collector.collection.validation.ClientFieldValidator;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.submission.service.SubmissionValidationService;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.util.*;

class SubmissionValidationTests {
    final JsonMapper json = JsonMapper.builder().build();
    final SubmissionValidationService validation =
            new SubmissionValidationService(
                    new ClientFieldValidator(
                            new MockEnvironment()
                                    .withProperty("collector.storage.enabled", "true")));

    ObjectNode field(String type) {
        var f =
                json.createObjectNode()
                        .put("id", UUID.randomUUID().toString())
                        .put("type", type)
                        .put("required", true);
        var r = f.putObject("validation");
        r.put("minLength", 3)
                .put("maxLength", 20)
                .put("minOptions", 1)
                .put("maxOptions", 2)
                .put("minFiles", 1)
                .put("maxFiles", 2)
                .put("maxRows", 2);
        r.putArray("options").addObject().put("key", "yes");
        return f;
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "SHORT_TEXT",
                "LONG_TEXT",
                "URL",
                "SINGLE_SELECT",
                "MULTI_SELECT",
                "FILE",
                "IMAGE",
                "REPEATER"
            })
    void missingRequiredHasItemError(String type) {
        var f = field(type);
        assertThatThrownBy(() -> validation.validate(f, json.createObjectNode()))
                .isInstanceOfSatisfying(
                        ApiException.class,
                        e -> {
                            assertThat(e.getCode()).isEqualTo("SUBMISSION_VALIDATION_FAILED");
                            assertThat(e.getErrors().getFirst().get("itemId"))
                                    .isEqualTo(f.path("id").asText());
                        });
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "SHORT_TEXT",
                "LONG_TEXT",
                "URL",
                "SINGLE_SELECT",
                "MULTI_SELECT",
                "FILE",
                "IMAGE",
                "REPEATER"
            })
    void optionalEmptyIsAllowed(String type) {
        var f = field(type).put("required", false);
        validation.validate(f, json.createObjectNode());
    }

    @ParameterizedTest
    @ValueSource(
            strings = {
                "SHORT_TEXT",
                "LONG_TEXT",
                "URL",
                "SINGLE_SELECT",
                "MULTI_SELECT",
                "FILE",
                "IMAGE",
                "REPEATER"
            })
    void invalidTypedValuesAreRejected(String type) {
        var f = field(type);
        var v = json.createObjectNode();
        switch (type) {
            case "SHORT_TEXT", "LONG_TEXT" -> v.put("text", "a");
            case "URL" -> v.put("url", "javascript:alert(1)");
            case "SINGLE_SELECT" -> v.put("optionKey", "invalid");
            case "MULTI_SELECT" -> v.putArray("optionKeys").add("invalid");
            case "FILE", "IMAGE" -> v.putArray("assetIds").add("bad-id");
            default -> v.putArray("rows").addObject().put("rowId", "bad-id");
        }
        assertThatThrownBy(() -> validation.validate(f, v)).isInstanceOf(ApiException.class);
    }

    @Test
    void repeaterRequiresConfiguredCellsAndValidFiniteNumbers() {
        var f = field("REPEATER");
        f.withObject("validation")
                .putArray("columns")
                .addObject()
                .put("key", "count")
                .put("type", "NUMBER")
                .put("required", true);
        var v = json.createObjectNode();
        var row = v.putArray("rows").addObject().put("rowId", UUID.randomUUID().toString());
        row.putObject("values");
        assertThatThrownBy(() -> validation.validate(f, v)).isInstanceOf(ApiException.class);
        row.withObject("values").put("count", 3);
        validation.validate(f, v);
        row.withObject("values").put("count", "NaN");
        assertThatThrownBy(() -> validation.validate(f, v)).isInstanceOf(ApiException.class);
    }
}
