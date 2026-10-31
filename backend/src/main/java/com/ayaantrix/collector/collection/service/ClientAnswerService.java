package com.ayaantrix.collector.collection.service;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.collection.dto.ClientAnswerDtos.*;
import com.ayaantrix.collector.collection.repository.ClientAnswerRepository;
import com.ayaantrix.collector.collection.validation.ClientFieldValidator;
import com.ayaantrix.collector.project.repository.ProjectStructureRepository;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.JsonNode;
import java.time.Clock;
import java.util.*;
@Service @Transactional
public class ClientAnswerService {
 private final com.ayaantrix.collector.attachment.repository.AttachmentRepository assetMetadata;private final com.ayaantrix.collector.attachment.service.AttachmentService attachments;private final com.ayaantrix.collector.attachment.storage.PrivateObjectStorage storage;
 private final com.ayaantrix.collector.submission.repository.SubmissionRepository revisions;
 private final ClientAccessAuthorization auth;private final ClientAnswerRepository answers;private final ProjectStructureRepository structures;private final ClientFieldValidator validator;private final AuditRepository audit;private final Clock clock;
 public ClientAnswerService(ClientAccessAuthorization auth,ClientAnswerRepository answers,ProjectStructureRepository structures,ClientFieldValidator validator,AuditRepository audit,Clock clock,com.ayaantrix.collector.attachment.service.AttachmentService attachments,com.ayaantrix.collector.attachment.storage.PrivateObjectStorage storage,com.ayaantrix.collector.attachment.repository.AttachmentRepository assetMetadata,com.ayaantrix.collector.submission.repository.SubmissionRepository revisions){this.revisions=revisions;this.assetMetadata=assetMetadata;this.attachments=attachments;this.storage=storage;this.auth=auth;this.answers=answers;this.structures=structures;this.validator=validator;this.audit=audit;this.clock=clock;}
 public Map<String,Object> read(String cookie,UUID project,UUID item){var a=auth.require(cookie,project);var rows=answers.drafts(a.grant().workspace(),project);var field=item(structures.structure(a.grant().workspace(),project),rows,item);var d=rows.get(item);var safe=tools.jackson.databind.node.JsonNodeFactory.instance.objectNode();for(String k:List.of("id","key","label","type","instructions","example","required","validation","version","state"))if(field.has(k))safe.set(k,field.get(k).deepCopy());var answer=d==null?new Answer(item,tools.jackson.databind.node.JsonNodeFactory.instance.objectNode(),0,null):d.answer();safe.put("visible",true).put("canEdit",a.project().state().name().equals("ACTIVE")&&a.workspace().state().name().equals("ACTIVE")&&Set.of("NOT_STARTED","DRAFT","CHANGES_REQUESTED").contains(field.path("state").asText())&&field.path("currentRevisionId").isNull()&&(storage.enabled()||!Set.of("IMAGE","FILE").contains(field.path("type").asText())));safe.set("answer",tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(answer));safe.set("assets",tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(assetMetadata.summaries(a.grant().workspace(),project,item)));safe.set("revisions",tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(revisions.history(a.grant().workspace(),project,item)));safe.putArray("comments");return Map.of("item",safe,"answer",answer,"clientComments",List.of(),"revisions",revisions.history(a.grant().workspace(),project,item).stream().map(r->revisions.detail(a.grant().workspace(),project,item,UUID.fromString(r.path("revisionId").asText()))).toList());}
 public Saved save(String cookie,UUID project,UUID item,Save input){
  var a=auth.require(cookie,project);var p=a.project();if(!p.state().name().equals("ACTIVE")||!a.workspace().state().name().equals("ACTIVE"))throw new ApiException(HttpStatus.CONFLICT,"READ_ONLY","This project is read-only.");
  var rows=answers.drafts(p.workspaceId(),project);var field=item(structures.structure(p.workspaceId(),project),rows,item);if(!Set.of("NOT_STARTED","DRAFT","CHANGES_REQUESTED").contains(field.path("state").asText())||!field.path("currentRevisionId").isNull())throw new ApiException(HttpStatus.CONFLICT,"READ_ONLY","This item requires the revision workflow.");
  if(input.expectedStructureVersion()!=p.structureVersion())throw new ApiException(HttpStatus.CONFLICT,"STRUCTURE_CONFLICT","The content request changed. Reload its structure before saving.",p.structureVersion());
  validator.validate(field,input.value());attachments.validateReferences(p.workspaceId(),project,item,input.value());var previous=rows.get(item);long version=previous==null?0:previous.answer().version();String hash=IdempotencyRepository.hash(input.value().toString()+":"+input.expectedVersion()+":"+input.expectedStructureVersion());
  if(previous!=null&&previous.operation().equals(input.saveOperationId())&&previous.contact().equals(a.grant().contact())){if(!previous.hash().equals(hash))throw new ApiException(HttpStatus.CONFLICT,"IDEMPOTENCY_KEY_REUSED","This save operation was used with different input.");return new Saved(previous.answer(),"DRAFT");}
  if(version!=input.expectedVersion())throw new ApiException(HttpStatus.CONFLICT,"ANSWER_VERSION_CONFLICT","This answer changed in another tab. Keep your local answer and compare with the saved version.",version);
  var now=clock.instant();answers.save(p.workspaceId(),project,item,a.grant().contact(),input,hash,now);audit.writeClient(p.workspaceId(),project,a.grant().contact(),"CLIENT_DRAFT_SAVED",item,now);return new Saved(answers.drafts(p.workspaceId(),project).get(item).answer(),"DRAFT");
 }
 private JsonNode item(List<JsonNode> sections,Map<UUID,ClientAnswerRepository.Draft> drafts,UUID id){for(var s:sections)for(var i:s.path("items"))if(i.path("id").asText().equals(id.toString())&&com.ayaantrix.collector.project.service.ProjectDraftVisibility.visible(s,i,sections,drafts.entrySet().stream().collect(java.util.stream.Collectors.toMap(Map.Entry::getKey,e->e.getValue().answer().value()))))return i;throw new ApiException(HttpStatus.NOT_FOUND,"NOT_FOUND","This question is unavailable.");}

}
