package com.ayaantrix.collector.project.service;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.dto.ProjectStructureDtos.*;
import com.ayaantrix.collector.project.entity.Project;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import jakarta.validation.Validator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.*;
import java.time.Clock;
import java.util.*;
import java.util.function.Consumer;
import static com.ayaantrix.collector.project.service.ProjectStructureValidationService.invalid;
@Service @Transactional
public class ProjectStructureService {
    private final ProjectAuthorization authorization;private final ProjectRepository projects;private final ProjectStructureRepository structures;
    private final ProjectStructureValidationService schema;private final Validator validator;private final Clock clock;private final JsonMapper json;
    ProjectStructureService(ProjectAuthorization authorization,ProjectRepository projects,ProjectStructureRepository structures,
            ProjectStructureValidationService schema,Validator validator,Clock clock,JsonMapper json){
        this.authorization=authorization;this.projects=projects;this.structures=structures;this.schema=schema;this.validator=validator;this.clock=clock;this.json=json;
    }
    public JsonNode createSection(UUID workspace,UUID project,SectionCreate input){
        valid(input);UUID id=UUID.randomUUID();
        mutate(workspace,project,input.expectedStructureVersion(),"SECTION_CREATED","SECTION",id,sections->{
            var section=json.createObjectNode();section.put("id",id.toString()).put("key",input.key()==null?"section_"+id.toString().replace("-", ""):input.key())
                .put("title",input.title().strip()).put("enabled",true).put("sortOrder",sections.size());section.putArray("items");sections.add(section);
        });return findSection(structures.structure(workspace,project),id);
    }
    public JsonNode patchSection(UUID workspace,UUID project,UUID id,SectionPatch input){
        valid(input);if(input.title()==null && input.enabled()==null)throw invalid("Provide section metadata to change.");
        mutate(workspace,project,input.expectedStructureVersion(),"SECTION_UPDATED","SECTION",id,sections->{
            var section=findSection(sections,id);
            if(Boolean.FALSE.equals(input.enabled()))for(var item:section.get("items"))unused(item);
            if(input.title()!=null)section.put("title",input.title().strip());if(input.enabled()!=null)section.put("enabled",input.enabled());
        });return findSection(structures.structure(workspace,project),id);
    }
    public JsonNode createItem(UUID workspace,UUID project,UUID section,ItemCreate input){
        valid(input);UUID id=UUID.randomUUID();
        mutate(workspace,project,input.expectedStructureVersion(),"ITEM_CREATED","ITEM",id,sections->{
            var target=findSection(sections,section);var items=(ArrayNode)target.get("items");var item=definition(input.definition());
            item.put("id",id.toString()).put("sectionId",section.toString()).put("sortOrder",items.size()).put("state","NOT_STARTED").put("version",1);item.putNull("currentRevisionId");items.add(item);
        });return findItem(structures.structure(workspace,project),id);
    }
    public JsonNode patchItem(UUID workspace,UUID project,UUID id,ItemPatch input){
        valid(input);
        mutate(workspace,project,input.expectedStructureVersion(),"ITEM_UPDATED","ITEM",id,sections->{
            var old=findItem(sections,id);var replacement=definition(input.definition());
            if(!old.get("key").equals(replacement.get("key")))throw invalid("An existing item's stable key cannot change.");
            // Collected work requires the later immutable-revision/reopen workflow. Never reset or fake it here.
            var previous=ProjectStructureRepository.definition(old);var next=replacement.deepCopy();
            for(String field:List.of("label","instructions","example")){previous.remove(field);next.remove(field);}
            if(!previous.equals(next))unused(old);
            for(String field:List.of("id","sectionId","sortOrder","state","version","currentRevisionId"))replacement.set(field,old.get(field));
            for(var section:sections){var items=(ArrayNode)section.get("items");for(int i=0;i<items.size();i++)if(items.get(i).get("id").asText().equals(id.toString()))items.set(i,replacement);}
        });return findItem(structures.structure(workspace,project),id);
    }
    public long reorder(UUID workspace,UUID project,Reorder input){
        valid(input);
        return mutate(workspace,project,input.expectedStructureVersion(),"STRUCTURE_REORDERED","PROJECT",project,sections->{
            exact(input.sectionIds(),sections.stream().map(s->UUID.fromString(s.get("id").asText())).toList());
            if(!input.itemOrderBySection().keySet().equals(new HashSet<>(input.sectionIds())))throw invalid("Provide item order for exactly the current sections.");
            var ordered=new ArrayList<JsonNode>();
            for(UUID sid:input.sectionIds()){
                var section=findSection(sections,sid);var items=(ArrayNode)section.get("items");var ids=new ArrayList<UUID>();for(var item:items)ids.add(UUID.fromString(item.get("id").asText()));
                var order=input.itemOrderBySection().get(sid);exact(order,ids);var byId=new HashMap<String,JsonNode>();for(var item:items)byId.put(item.get("id").asText(),item);
                items.removeAll();for(UUID iid:order){var item=(ObjectNode)byId.get(iid.toString());item.put("sortOrder",items.size());items.add(item);}
                section.put("sortOrder",ordered.size());ordered.add(section);
            }
            sections.clear();sections.addAll(ordered);
        });
    }
    private long mutate(UUID workspace,UUID id,long expected,String action,String kind,UUID resource,Consumer<List<JsonNode>> mutation){
        var access=authorization.access(workspace,true);authorization.writable(access);
        var project=projects.lockForStructure(workspace,id).orElseThrow(ProjectAuthorization::missing);
        if(!project.structureEditable())throw new ApiException(HttpStatus.CONFLICT,"READ_ONLY","This project cannot be edited in its current state.");
        if(expected!=project.structureVersion())throw new ApiException(HttpStatus.CONFLICT,"STRUCTURE_CONFLICT","The project structure changed. Refresh the latest version before retrying.",project.structureVersion());
        var before=structures.structure(workspace,id);var after=new ArrayList<JsonNode>();for(var section:before)after.add(section.deepCopy());
        mutation.accept(after);schema.validate(project,after);
        var now=clock.instant();structures.apply(project,before,after,now);project.structureChanged(now);projects.saveAndFlush(project);
        structures.audit(project,access.member().userId(),action,kind,resource,now);return project.structureVersion();
    }
    private void valid(Object input){if(input==null || !validator.validate(input).isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Structure request fields are invalid.");}
    private ObjectNode definition(JsonNode input){
        if(!input.isObject())throw invalid("Item definition must be an object.");
        for(String field:List.of("id","sectionId","sortOrder","state","version","currentRevisionId","visible"))if(input.has(field))throw invalid("Item definition contains a reserved property.");
        var copy=(ObjectNode)input.deepCopy();if(!copy.has("enabled"))copy.put("enabled",true);return copy;
    }
    private static ObjectNode findSection(List<JsonNode> sections,UUID id){return (ObjectNode)sections.stream().filter(s->s.get("id").asText().equals(id.toString())).findFirst().orElseThrow(ProjectAuthorization::missing);}
    private static ObjectNode findItem(List<JsonNode> sections,UUID id){for(var s:sections)for(var i:s.get("items"))if(i.get("id").asText().equals(id.toString()))return (ObjectNode)i;throw ProjectAuthorization.missing();}
    private static void exact(List<UUID> proposed,List<UUID> actual){if(proposed==null || proposed.size()!=actual.size() || new HashSet<>(proposed).size()!=proposed.size() || !new HashSet<>(proposed).equals(new HashSet<>(actual)))throw invalid("Order must contain each current identifier exactly once within its section.");}
    private static void unused(JsonNode item){if(!item.path("state").asText().equals("NOT_STARTED") || !item.path("currentRevisionId").isNull())throw new ApiException(HttpStatus.CONFLICT,"REOPEN_REQUIRED","Collected work requires the revision reopening workflow before structural changes.");}
}
