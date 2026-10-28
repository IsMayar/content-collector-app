package com.ayaantrix.collector.project.service;
import com.ayaantrix.collector.project.dto.ProjectDtos.*;
import com.ayaantrix.collector.project.entity.*;
import com.ayaantrix.collector.project.repository.*;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import com.ayaantrix.collector.template.entity.Template.ProjectType;
import com.ayaantrix.collector.template.repository.TemplateCatalogRepository;
import com.ayaantrix.collector.template.validation.TemplateSchemaValidator;
import com.ayaantrix.collector.common.error.ApiException;
import jakarta.validation.Validator;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import java.util.stream.Collectors;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
@Service @Transactional
public class ProjectService {
    private final ProjectAuthorization authorization;private final ProjectRepository projects;private final ProjectCustomerRepository customers;
    private final TemplateCatalogRepository catalog;private final TemplateSchemaValidator schema;private final ProjectSnapshotService snapshots;
    private final ProjectStructureRepository structure;private final ProjectCreationRequests requests;private final Clock clock;private final Validator validator;private final JsonMapper json;
    ProjectService(ProjectAuthorization authorization,ProjectRepository projects,ProjectCustomerRepository customers,TemplateCatalogRepository catalog,
            TemplateSchemaValidator schema,ProjectSnapshotService snapshots,ProjectStructureRepository structure,ProjectCreationRequests requests,Clock clock,Validator validator,JsonMapper json){
        this.authorization=authorization;this.projects=projects;this.customers=customers;this.catalog=catalog;this.schema=schema;this.snapshots=snapshots;
        this.structure=structure;this.requests=requests;this.clock=clock;this.validator=validator;this.json=json;
    }
    public View create(UUID workspace,Create input,String key){
        var access=authorization.access(workspace,true);authorization.writable(access);valid(input);
        if(key==null || !key.matches("[a-zA-Z0-9._:-]{1,180}"))throw invalid();
        if(!ZoneId.getAvailableZoneIds().contains(input.timezone()) || input.dueDate().getYear()<1 || input.dueDate().getYear()>9999)throw invalid();
        var normalized=new Create(input.clientId(),input.title().strip(),input.projectType(),input.dueDate(),input.timezone(),input.templateVersionId());
        String hash=hash(json.writeValueAsString(normalized));var now=clock.instant();
        var previous=requests.replay(workspace,access.member().userId(),key,hash,now);
        if(previous.isPresent())return json.readValue(previous.get(),View.class);
        var customer=customers.findByWorkspaceIdAndId(workspace,input.clientId()).orElseThrow(ProjectAuthorization::missing);
        var template=catalog.definition(workspace,input.templateVersionId()).orElseThrow(ProjectAuthorization::missing);
        if(template.template().projectType()!=input.projectType())throw new ApiException(HttpStatus.BAD_REQUEST,"TEMPLATE_TYPE","Choose a template for this project type.");
        var definition=schema.validate(template.definition());
        if(!definition.get("projectType").asText().equals(input.projectType().name()))throw new ApiException(HttpStatus.BAD_REQUEST,"TEMPLATE_TYPE","Choose a template for this project type.");
        var project=projects.saveAndFlush(new Project(workspace,customer.id(),template.id(),access.member().userId(),normalized.title(),input.projectType(),input.dueDate(),input.timezone(),now));
        snapshots.copy(project,definition,now);var result=view(project,customer.businessName(),progress(workspace,project.id()),true);
        requests.remember(workspace,access.member().userId(),key,hash,json.writeValueAsString(result),now);return result;
    }
    public Detail read(UUID workspace,UUID id){
        var access=authorization.access(workspace,false);authorization.readableProject(access);
        var project=projects.findByWorkspaceIdAndId(workspace,id).orElseThrow(ProjectAuthorization::missing);
        var customer=customers.findByWorkspaceIdAndId(workspace,project.clientId()).orElseThrow(ProjectAuthorization::missing);
        var progress=progress(workspace,id);return new Detail(view(project,customer.businessName(),progress,authorization.canWrite(access)),progress,structure.structure(workspace,id));
    }
    public Paged<Summary> list(UUID workspace,String search,ProjectType type,ProjectState state,String sort,int page,int size){
        var access=authorization.access(workspace,false);pagination(page,size);
        if(search==null)search="";if(search.length()>200 || !Set.of("updatedAt","title","dueDate").contains(sort))throw invalid();
        if(!authorization.owner(access))return new Paged<>(List.of(),new Page(page,size,0));
        var order=Sort.by(sort.equals("updatedAt")?Sort.Direction.DESC:Sort.Direction.ASC,sort).and(Sort.by("id"));
        String pattern="%"+search.toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%";
        var result=projects.list(workspace,type,state,pattern,PageRequest.of(page,size,order));
        var names=customers.findByWorkspaceIdAndIdIn(workspace,result.stream().map(Project::clientId).toList()).stream().collect(Collectors.toMap(ProjectCustomer::id,ProjectCustomer::businessName));
        var counts=structure.progress(workspace,result.stream().map(Project::id).toList());
        return new Paged<>(result.stream().map(p->new Summary(p.id(),p.workspaceId(),p.title(),names.get(p.clientId()),p.projectType(),p.state(),p.dueDate(),p.timezone(),counts.getOrDefault(p.id(),emptyProgress()),p.updatedAt())).toList(),new Page(page,size,result.getTotalElements()));
    }
    public Customer createCustomer(UUID workspace,CustomerCreate input){
        var access=authorization.access(workspace,true);authorization.writable(access);valid(input);
        String email=input.email()==null || input.email().isBlank()?null:input.email().strip().toLowerCase(Locale.ROOT);
        if(email!=null && email.chars().anyMatch(Character::isWhitespace))throw invalid();
        var customer=customers.saveAndFlush(new ProjectCustomer(workspace,input.businessName().strip(),input.contactName()==null || input.contactName().isBlank()?null:input.contactName().strip(),email,clock.instant()));return customer(customer);
    }
    public Paged<Customer> customers(UUID workspace,int page,int size){
        var access=authorization.access(workspace,false);pagination(page,size);
        if(!authorization.owner(access))return new Paged<>(List.of(),new Page(page,size,0));
        var result=customers.findByWorkspaceId(workspace,PageRequest.of(page,size,Sort.by("businessName","id")));
        return new Paged<>(result.stream().map(ProjectService::customer).toList(),new Page(page,size,result.getTotalElements()));
    }
    private Progress progress(UUID workspace,UUID id){return structure.progress(workspace,List.of(id)).getOrDefault(id,emptyProgress());}
    private static Progress emptyProgress(){return new Progress(0,0,0,0,0);}
    private static View view(Project p,String customer,Progress progress,boolean writable){return new View(p.id(),p.workspaceId(),p.title(),customer,p.projectType(),p.state(),p.dueDate(),p.timezone(),progress,p.updatedAt(),p.clientId(),p.version(),p.structureVersion(),p.aiEnabled(),new Permissions(writable && p.structureEditable(),writable,true,writable));}
    private static Customer customer(ProjectCustomer c){return new Customer(c.id(),c.businessName(),c.contactName(),c.email(),c.version());}
    private void valid(Object value){if(value==null || !validator.validate(value).isEmpty())throw invalid();}
    private static void pagination(int page,int size){if(page<0 || size<1 || size>100)throw invalid();}
    private static String hash(String input){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));}catch(NoSuchAlgorithmException impossible){throw new IllegalStateException("Request hashing unavailable.");}}
    private static ApiException invalid(){return new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Project request fields are invalid.");}
}
