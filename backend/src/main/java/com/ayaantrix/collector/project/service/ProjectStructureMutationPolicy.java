package com.ayaantrix.collector.project.service;

import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.repository.ProjectStructureRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import java.util.*;
import static com.ayaantrix.collector.project.service.ProjectStructureValidationService.invalid;

/**
 * Assesses the complete proposed mutation under the service's project-row lock.
 * T17/T22 can consume this impact plan when real drafts/revisions and atomic reopening exist.
 * A request's reopenAffected flag is intent, never proof that collected work was handled.
 */
@Component
public class ProjectStructureMutationPolicy {
    public record Impact(Set<UUID> affectedItemIds, Set<UUID> draftItemIds, Set<UUID> revisionItemIds) {
        public Impact {
            affectedItemIds=Set.copyOf(affectedItemIds);
            draftItemIds=Set.copyOf(draftItemIds);
            revisionItemIds=Set.copyOf(revisionItemIds);
        }
        public boolean requiresCollectedWorkHandling(){return !draftItemIds.isEmpty() || !revisionItemIds.isEmpty();}
    }

    public Impact assess(List<JsonNode> before,List<JsonNode> after) {
        var oldItems=items(before);var newItems=items(after);
        var oldSections=sections(before);var newSections=sections(after);
        if(!newItems.keySet().containsAll(oldItems.keySet()) || !newSections.keySet().containsAll(oldSections.keySet()))
            throw invalid("Remove requests by disabling them; existing identifiers must be retained.");
        var affected=new HashSet<String>();
        for(var entry:oldItems.entrySet()){
            var previous=entry.getValue();var current=newItems.get(entry.getKey());
            if(!previous.get("key").equals(current.get("key")) || !previous.get("sectionId").equals(current.get("sectionId")))
                throw invalid("Existing stable keys and section ownership must be retained.");
            var previousDefinition=ProjectStructureRepository.definition(previous);
            var currentDefinition=ProjectStructureRepository.definition(current);
            for(String metadata:List.of("label","instructions","example")){
                previousDefinition.remove(metadata);currentDefinition.remove(metadata);
            }
            String section=previous.get("sectionId").asText();
            if(!previousDefinition.equals(currentDefinition) ||
                    oldSections.get(section).path("enabled").asBoolean(true)!=newSections.get(section).path("enabled").asBoolean(true))
                affected.add(previous.get("key").asText());
        }
        // Changes to a controller can affect collected descendants even if their own schema is unchanged.
        boolean changed;
        do {
            changed=false;
            for(var item:newItems.values()){
                var old=oldItems.get(item.get("id").asText());
                String key=item.get("key").asText();
                boolean dependency=affected.contains(item.path("visibleWhen").path("dependsOnItemKey").asText()) ||
                    (old!=null && affected.contains(old.path("visibleWhen").path("dependsOnItemKey").asText()));
                if(dependency)changed|=affected.add(key);
            }
        }while(changed);
        var ids=new HashSet<UUID>();var drafts=new HashSet<UUID>();var revisions=new HashSet<UUID>();
        for(var entry:oldItems.entrySet()){
            var item=entry.getValue();if(!affected.contains(item.get("key").asText()))continue;
            UUID id=UUID.fromString(entry.getKey());ids.add(id);
            String state=item.path("state").asText();boolean revision=!item.path("currentRevisionId").isNull();
            if(state.equals("DRAFT") && !revision)drafts.add(id);
            else if(!state.equals("NOT_STARTED") || revision)revisions.add(id);
        }
        return new Impact(ids,drafts,revisions);
    }

    public void requireSupported(Impact impact,boolean reopenRequested) {
        if(!impact.requiresCollectedWorkHandling())return;
        // Persisted draft existence is reflected in item DRAFT state. Semantic changes remain fail-closed pending draft revalidation/reopening.
        String detail=reopenRequested
            ? "This collected work has no eligible persisted reopening. Reopen the exact revision with a reason and preserve a compatible draft."
            : "This change affects collected work. Use the revision reopening workflow before changing its structure.";
        throw new ApiException(HttpStatus.CONFLICT,"REOPEN_REQUIRED",detail);
    }

    private static Map<String,JsonNode> sections(List<JsonNode> source){
        var result=new LinkedHashMap<String,JsonNode>();for(var section:source)result.put(section.get("id").asText(),section);return result;
    }
    private static Map<String,JsonNode> items(List<JsonNode> source){
        var result=new LinkedHashMap<String,JsonNode>();for(var section:source)for(var item:section.get("items"))result.put(item.get("id").asText(),item);return result;
    }
}
