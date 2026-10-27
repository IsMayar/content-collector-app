package com.ayaantrix.collector.workspace.service;
import com.ayaantrix.collector.workspace.dto.WorkspaceDtos;
import com.ayaantrix.collector.workspace.entity.PlanKey;
import com.ayaantrix.collector.workspace.entity.Workspace;
import com.ayaantrix.collector.workspace.entity.WorkspaceMember;
import com.ayaantrix.collector.workspace.entity.WorkspaceRole;
import com.ayaantrix.collector.workspace.entity.WorkspaceSubscription;
import com.ayaantrix.collector.workspace.repository.WorkspaceMemberRepository;
import com.ayaantrix.collector.workspace.repository.WorkspaceRepository;
import com.ayaantrix.collector.workspace.repository.WorkspaceSubscriptionRepository;
import com.ayaantrix.collector.workspace.security.WorkspaceAuthorization;

import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service @Transactional
public class WorkspaceService {
    private final WorkspaceAuthorization authorization;private final WorkspaceRepository workspaces;
    private final WorkspaceMemberRepository members;private final WorkspaceSubscriptionRepository subscriptions;
    private final Clock clock;private final int trialAi,trialSms;
    WorkspaceService(WorkspaceAuthorization authorization,WorkspaceRepository workspaces,WorkspaceMemberRepository members,
            WorkspaceSubscriptionRepository subscriptions,Clock clock,
            @Value("${collector.workspace.trial-ai-drafts:0}") int trialAi,@Value("${collector.workspace.trial-sms-segments:0}") int trialSms){
        if(trialAi<0 || trialAi>100 || trialSms<0 || trialSms>25)throw new IllegalStateException("Invalid trial allowance configuration.");
        this.authorization=authorization;this.workspaces=workspaces;this.members=members;this.subscriptions=subscriptions;this.clock=clock;this.trialAi=trialAi;this.trialSms=trialSms;
    }
    public WorkspaceDtos.View create(WorkspaceDtos.Create request){
        UUID user=authorization.actor();String name=name(request.name());String timezone=timezone(request.timezone()==null?"America/Chicago":request.timezone());
        if(members.existsByUserIdAndRoleAndState(user,WorkspaceRole.OWNER,WorkspaceMember.State.ACTIVE))
            throw new ApiException(HttpStatus.CONFLICT,"WORKSPACE_ALREADY_OWNED","An owned workspace already exists.");
        var now=clock.instant();var workspace=workspaces.saveAndFlush(new Workspace(name,timezone,now));
        members.saveAndFlush(new WorkspaceMember(workspace.id(),user,WorkspaceRole.OWNER,now));
        subscriptions.saveAndFlush(new WorkspaceSubscription(workspace.id(),request.planKey()==null?PlanKey.SOLO:request.planKey(),now));
        return WorkspaceDtos.View.from(workspace);
    }
    public List<WorkspaceDtos.Membership> list(){return workspaces.memberships(authorization.actor());}
    public WorkspaceDtos.Details read(UUID workspace){
        var access=authorization.require(workspace,authorization.actor(),false);
        return new WorkspaceDtos.Details(WorkspaceDtos.View.from(access.workspace()),entitlements(access.workspace()));
    }
    public WorkspaceDtos.View update(UUID workspace,WorkspaceDtos.Update request){
        var w=authorization.require(workspace,authorization.actor(),true).workspace();
        if(request.expectedVersion()==null || !request.expectedVersion().equals(w.version()))throw new ApiException(HttpStatus.CONFLICT,"VERSION_CONFLICT","The workspace has changed. Reload and try again.");
        if(!entitlements(w).canWrite())throw new ApiException(HttpStatus.FORBIDDEN,"WORKSPACE_READ_ONLY","Workspace changes are unavailable.");
        w.update(request.name()==null?null:name(request.name()),request.timezone()==null?null:timezone(request.timezone()),clock.instant());
        // Flush before constructing the DTO so the incremented version is returned.
        return WorkspaceDtos.View.from(workspaces.saveAndFlush(w));
    }
    private WorkspaceDtos.Entitlements entitlements(Workspace w){
        var subscription=subscriptions.findByWorkspaceId(w.id());
        if(subscription.isEmpty())return new WorkspaceDtos.Entitlements(PlanKey.SOLO,0,0,false,0,0,false,false,false);
        var s=subscription.get();var p=s.plan();boolean writable=w.state()==Workspace.State.ACTIVE && s.writable(clock.instant());
        // No AI/SMS provider is activated by a plan selection, even with an allowance.
        return new WorkspaceDtos.Entitlements(p,p.seats(),Math.min(w.storageLimit(),PlanKey.STORAGE_BYTES),true,
            s.trial()?trialAi:p.aiDrafts(),s.trial()?trialSms:p.smsSegments(),writable,false,false);
    }
    private static String name(String value){
        if(value==null || value.strip().isEmpty() || value.length()>150)throw invalid();return value.strip();
    }
    private static String timezone(String value){
        if(value==null || value.length()>80 || !ZoneId.getAvailableZoneIds().contains(value))throw invalid();return value;
    }
    private static ApiException invalid(){return new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","Workspace settings are invalid.");}
}
