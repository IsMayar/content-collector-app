package com.ayaantrix.collector.collection.dto;
import jakarta.validation.constraints.*;
import tools.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.UUID;
public final class ClientAnswerDtos {
 private ClientAnswerDtos(){}
 public record Save(@NotNull JsonNode value,@NotNull @Min(0) Long expectedVersion,@NotNull @Min(1) Long expectedStructureVersion,@NotNull UUID saveOperationId){@Override public String toString(){return "ClientAnswerSave[redacted]";}}
 public record Answer(UUID itemId,JsonNode value,long version,Instant savedAt){}
 public record Saved(Answer answer,String itemState){}
}
