package com.ayaantrix.collector.clientaccess.service;
import com.ayaantrix.collector.auth.entity.*;
import com.ayaantrix.collector.auth.repository.AccountTokenRepository;
import com.ayaantrix.collector.auth.security.*;
import com.ayaantrix.collector.auth.delivery.VerificationOutbox;
import com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.*;
import com.ayaantrix.collector.clientaccess.entity.ClientSession;
import com.ayaantrix.collector.clientaccess.repository.*;
import com.ayaantrix.collector.clientaccess.security.ClientAccessAuthorization;
import com.ayaantrix.collector.common.error.ApiException;
import com.ayaantrix.collector.common.repository.*;
import com.ayaantrix.collector.project.repository.ProjectRepository;
import com.ayaantrix.collector.project.security.ProjectAuthorization;
import jakarta.validation.Validator;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
@Service @Transactional
public class ClientAccessService {
 private final ProjectAuthorization agency;private final ProjectRepository projects;private final ClientAccessAuthorization clients;private final ClientAccessRepository grants;private final ClientSessionRepository sessions;private final AccountTokenRepository tokens;private final SecureAccountTokens secrets;private final VerificationOutbox outbox;private final AuditRepository audit;private final IdempotencyRepository requests;private final JsonMapper json;private final Validator validator;private final Clock clock;
 public ClientAccessService(ProjectAuthorization agency,ProjectRepository projects,ClientAccessAuthorization clients,ClientAccessRepository grants,ClientSessionRepository sessions,AccountTokenRepository tokens,SecureAccountTokens secrets,VerificationOutbox outbox,AuditRepository audit,IdempotencyRepository requests,JsonMapper json,Validator validator,Clock clock){this.agency=agency;this.projects=projects;this.clients=clients;this.grants=grants;this.sessions=sessions;this.tokens=tokens;this.secrets=secrets;this.outbox=outbox;this.audit=audit;this.requests=requests;this.json=json;this.validator=validator;this.clock=clock;}
 public Invitation invite(UUID workspace,UUID project,UUID contact,String key,String trace){
  var access=agency.access(workspace,true);agency.writable(access);var p=projects.lockForStructure(workspace,project).orElseThrow(ProjectAuthorization::missing);
  if(!Set.of("ACTIVE","PAUSED","COMPLETED").contains(p.state().name()))throw new ApiException(HttpStatus.CONFLICT,"PROJECT_NOT_PUBLISHED","Publish the project before sending invitations. Archived/deleted projects cannot issue links.");
  var g=grants.contact(workspace,project,contact).orElseThrow(ProjectAuthorization::missing);var now=clock.instant();if(!now.isBefore(g.expires()))throw new ApiException(HttpStatus.CONFLICT,"GRANT_EXPIRED","Create a contact with a valid access expiry before inviting.");
  String route="/api/v1/workspaces/"+workspace+"/projects/"+project+"/contacts/"+contact+"/invite",hash=IdempotencyRepository.hash(contact.toString());var replay=requests.replay(workspace,access.member().userId(),route,key,hash,now);if(replay.isPresent())return json.readValue(replay.get(),Invitation.class);
  grants.initialize(g,now);var invitation=issue(g,trace);audit.write(workspace,project,access.member().userId(),"CLIENT_INVITATION_CREATED","CONTACT",contact,Map.of(),now);requests.remember(workspace,access.member().userId(),route,key,hash,json.writeValueAsString(invitation),202,now);return invitation;
 }
 private Invitation issue(ClientAccessRepository.Grant g,String trace){var now=clock.instant();grants.revokeInvitations(g,now);String raw=secrets.generate();var token=new AccountToken(g.workspace(),g.project(),g.contact(),g.email(),secrets.digest(raw),now,g.expires());tokens.saveAndFlush(token);outbox.enqueue(token,raw,trace);return new Invitation(token.getId(),g.email(),token.getExpiresAt().isBefore(g.expires())?token.getExpiresAt():g.expires(),"PENDING");}
 public void revoke(UUID workspace,UUID project,UUID contact){var access=agency.access(workspace,true);projects.lockForStructure(workspace,project).orElseThrow(ProjectAuthorization::missing);var g=grants.contact(workspace,project,contact).orElseThrow(ProjectAuthorization::missing);if(g.state().equals("REVOKED"))return;var now=clock.instant();grants.revoke(g,now);grants.revokeInvitations(g,now);sessions.revokeGrant(workspace,project,contact,now);audit.write(workspace,project,access.member().userId(),"CLIENT_ACCESS_REVOKED","CONTACT",contact,Map.of(),now);}
 public Issued exchange(Exchange input,String previous){valid(input);AccountToken token;try{token=tokens.findByTokenHashAndPurpose(secrets.digest(input.token()),TokenPurpose.CLIENT_INVITE).orElseThrow(ClientAccessAuthorization::unavailable);}catch(IllegalArgumentException e){throw ClientAccessAuthorization.unavailable();}
  var access=clients.grant(token.getWorkspaceId(),token.getProjectId(),token.getContactId(),true);var now=clock.instant();if(!token.getEmailNormalized().equals(access.grant().email())||tokens.consume(token.getId(),TokenPurpose.CLIENT_INVITE,now)!=1)throw ClientAccessAuthorization.unavailable();
  logout(previous);String raw=secrets.generate();Instant end=now.plus(Duration.ofDays(7));if(access.grant().expires().isBefore(end))end=access.grant().expires();var session=sessions.saveAndFlush(new ClientSession(token.getWorkspaceId(),token.getProjectId(),token.getContactId(),secrets.digest(raw),now,end));grants.discardConsumed(token.getId(),now);audit.writeClient(token.getWorkspaceId(),token.getProjectId(),token.getContactId(),"CLIENT_ACCESS_EXCHANGED",session.id(),now);return new Issued(raw,token.getProjectId(),end);
 }
 public void request(RequestLink input,String trace){valid(input);String email=EmailAddresses.normalize(input.email());var candidate=grants.candidate(input.projectId(),email);if(candidate.isEmpty())return;var g=candidate.get();if(clients.available(g.workspace(),g.project(),g.contact(),true).isEmpty())return;issue(g,trace);audit.writeAnonymous(g.workspace(),g.project(),g.contact(),"CLIENT_INVITATION_REQUESTED",g.contact(),clock.instant());}
 public void logout(String raw){try{sessions.revokeToken(secrets.digest(raw),clock.instant());}catch(IllegalArgumentException ignored){}}
 private void valid(Object input){if(input==null||!validator.validate(input).isEmpty())throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Client access fields are invalid.");}
}
