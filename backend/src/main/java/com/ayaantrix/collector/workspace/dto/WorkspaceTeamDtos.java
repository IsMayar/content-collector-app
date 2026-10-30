package com.ayaantrix.collector.workspace.dto;
import com.ayaantrix.collector.auth.dto.SessionResponses;
import com.ayaantrix.collector.workspace.entity.*;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
public final class WorkspaceTeamDtos {
 private WorkspaceTeamDtos(){}
 public record Invite(@NotBlank @Email @Size(max=254) String email,@Pattern(regexp="MEMBER") String role){}
 public record Accept(@NotBlank @Size(max=100) String token){@Override public String toString(){return "TeamAccept[redacted]";}}
 public record StateChange(@NotNull WorkspaceMember.State state,@Pattern(regexp="MEMBER") String role){}
 public record Transfer(@NotNull UUID targetMemberId,@NotBlank @Size(max=128) String currentPassword){@Override public String toString(){return "OwnershipTransfer[redacted]";}}
 public record Invitation(UUID id,String email,Instant expiresAt,String state){}
 public record Member(UUID id,SessionResponses.User user,WorkspaceRole role,WorkspaceMember.State state){}
 public record Team(List<Member> data,List<Invitation> pendingInvites){}
}
