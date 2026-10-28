package com.ayaantrix.collector.project.service;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.project.entity.Project;
import com.ayaantrix.collector.template.validation.TemplateSchemaValidator;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import java.util.*;
@Component
public class ProjectStructureValidationService {
    private final TemplateSchemaValidator validator;private final JsonMapper json;
    ProjectStructureValidationService(TemplateSchemaValidator validator,JsonMapper json){this.validator=validator;this.json=json;}
    public void validate(Project project,List<JsonNode> sections){
        var root=json.createObjectNode();root.put("schemaVersion",1).put("key","project").put("title","Project structure")
            .put("industry","project").put("projectType",project.projectType().name());var target=root.putArray("sections");
        for(var section:sections){
            var s=target.addObject();s.set("key",section.get("key"));s.set("title",section.get("title"));var items=s.putArray("items");
            var earlier=new HashMap<String,JsonNode>();
            for(var item:section.get("items")){
                if(item.path("enabled").asBoolean(true) && item.has("visibleWhen")){
                    var control=earlier.get(item.path("visibleWhen").path("dependsOnItemKey").asText());
                    if(control!=null && !control.path("enabled").asBoolean(true))throw invalid("A visible item requires an enabled controlling item.");
                }
                items.add(com.ayaantrix.collector.project.repository.ProjectStructureRepository.definition(item));earlier.put(item.path("key").asText(),item);
            }
        }
        try{validator.validateProjectStructure(root);}
        catch(TemplateSchemaValidator.InvalidTemplate invalid){
            var d=invalid.diagnostic();throw invalid("Invalid project structure at "+d.fieldPath()+": "+d.code()+".");
        }
    }
    public static ApiException invalid(String message){return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT,"VALIDATION_FAILED",message);}
}
