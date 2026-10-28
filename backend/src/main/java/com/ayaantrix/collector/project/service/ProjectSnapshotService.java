package com.ayaantrix.collector.project.service;
import com.ayaantrix.collector.project.entity.*;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.template.validation.TemplateSchemaValidator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import tools.jackson.databind.JsonNode;
import java.time.Instant;
@Service @Transactional(propagation=Propagation.MANDATORY)
public class ProjectSnapshotService {
    private final ProjectSnapshotRepository snapshots;private final ProjectStructureRepository structure;private final TemplateSchemaValidator validator;
    ProjectSnapshotService(ProjectSnapshotRepository snapshots,ProjectStructureRepository structure,TemplateSchemaValidator validator){this.snapshots=snapshots;this.structure=structure;this.validator=validator;}
    public void copy(Project project,JsonNode original,Instant now){
        var independent=validator.validate(original);snapshots.saveAndFlush(new ProjectSnapshot(project,independent.toString(),now));structure.copy(project,independent,now);
    }
}
