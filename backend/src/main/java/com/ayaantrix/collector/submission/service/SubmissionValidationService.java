package com.ayaantrix.collector.submission.service;

import com.ayaantrix.collector.collection.validation.ClientFieldValidator;
import com.ayaantrix.collector.common.error.ApiException;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import tools.jackson.databind.JsonNode;

import java.util.*;

@Service
public class SubmissionValidationService {
    private final ClientFieldValidator drafts;

    public SubmissionValidationService(ClientFieldValidator drafts) {
        this.drafts = drafts;
    }

    public void validate(JsonNode item, JsonNode value) {
        try {
            drafts.validate(item, value);
            var rules = item.path("validation");
            boolean required = item.path("required").asBoolean();
            String type = item.path("type").asText();
            var v =
                    value.path(
                            switch (type) {
                                case "SHORT_TEXT", "LONG_TEXT" -> "text";
                                case "URL" -> "url";
                                case "SINGLE_SELECT" -> "optionKey";
                                case "MULTI_SELECT" -> "optionKeys";
                                case "IMAGE", "FILE" -> "assetIds";
                                default -> "rows";
                            });
            boolean empty =
                    v.isMissingNode()
                            || v.isNull()
                            || (v.isString() ? v.asText().isBlank() : v.isEmpty());
            if (required && empty) fail(item, "Complete this required question.");
            if (empty) return;
            if (Set.of("SHORT_TEXT", "LONG_TEXT").contains(type)
                    && v.asText().codePointCount(0, v.asText().length())
                            < rules.path("minLength").asInt(0))
                fail(item, "Add more detail to meet the minimum length.");
            if (type.equals("MULTI_SELECT") && v.size() < rules.path("minOptions").asInt(0))
                fail(item, "Select the minimum number of options.");
            if (Set.of("IMAGE", "FILE").contains(type)
                    && v.size() < rules.path("minFiles").asInt(0))
                fail(item, "Add the minimum number of verified files.");
            if (type.equals("REPEATER")) {
                if (v.size() < rules.path("minRows").asInt(0))
                    fail(item, "Add the minimum number of entries.");
                for (var row : v)
                    for (var c : rules.path("columns")) {
                        var cell = row.path("values").path(c.path("key").asText());
                        if (c.path("required").asBoolean()
                                && (cell.isMissingNode()
                                        || cell.isNull()
                                        || (cell.isString() && cell.asText().isBlank())
                                        || (cell.isArray() && cell.isEmpty())))
                            fail(item, "Complete required fields in each entry.");
                        if (c.path("type").asText().equals("NUMBER") && cell.isNumber()) {
                            if (c.has("min")
                                            && cell.decimalValue()
                                                            .compareTo(c.path("min").decimalValue())
                                                    < 0
                                    || c.has("max")
                                            && cell.decimalValue()
                                                            .compareTo(c.path("max").decimalValue())
                                                    > 0)
                                fail(item, "Use a number within the configured range.");
                        }
                    }
            }
        } catch (ApiException e) {
            if (e.getStatus().value() != 422) throw e;
            fail(item, e.getMessage());
        }
    }

    private void fail(JsonNode item, String message) {
        throw new ApiException(
                HttpStatus.UNPROCESSABLE_CONTENT, "SUBMISSION_VALIDATION_FAILED", message) {
            @Override
            public List<Map<String, String>> getErrors() {
                return List.of(
                        Map.of(
                                "itemId",
                                item.path("id").asText(),
                                "fieldPath",
                                "value",
                                "message",
                                message));
            }
        };
    }
}
