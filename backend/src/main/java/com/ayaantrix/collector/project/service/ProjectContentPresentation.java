package com.ayaantrix.collector.project.service;
import com.ayaantrix.collector.project.dto.ProjectClientDtos.*;
import com.ayaantrix.collector.project.dto.ProjectDtos;
import com.ayaantrix.collector.project.entity.Project;
import com.ayaantrix.collector.project.repository.ProjectStructureRepository;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import java.util.*;
@Component
public class ProjectContentPresentation {
 private final ProjectStructureRepository structures;
 public ProjectContentPresentation(ProjectStructureRepository structures){this.structures=structures;}
 public Preview present(Project project,String agency){
        var sections=new ArrayList<JsonNode>();long required=0;
        for(var source:structures.structure(project.workspaceId(),project.id())) {
            if(!source.path("enabled").asBoolean())continue;
            var section=(ObjectNode)source.deepCopy();var items=section.putArray("items");
            for(var item:source.get("items")) {
                // No draft answers exist yet. Conditional requests are hidden until real answer evaluation.
                if(!item.path("visible").asBoolean())continue;
                var shown=tools.jackson.databind.node.JsonNodeFactory.instance.objectNode();
                for(String key:List.of("key","label","type","instructions","example","required","validation","enabled","ai","visibleWhen"))if(item.has(key))shown.set(key,item.get(key).deepCopy());
                shown.put("id",item.get("id").asText()).put("version",item.get("version").asLong())
                    .put("state","NOT_STARTED").put("visible",true).put("canEdit",false);
                shown.putNull("answer");shown.putArray("assets");shown.putArray("comments");items.add(shown);
                if(shown.path("required").asBoolean())required++;
            }
            sections.add(section);
        }
        return new Preview(new PreviewProject(project.id(),project.title(),project.projectType(),project.state(),project.dueDate(),
            project.structureVersion(),agency,false),sections,new ProjectDtos.Progress(required,0,0,required,0));
 }
}
