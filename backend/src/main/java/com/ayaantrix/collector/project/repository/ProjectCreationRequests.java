package com.ayaantrix.collector.project.repository;
import com.ayaantrix.collector.common.repository.IdempotencyRepository;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.*;
@Repository
public class ProjectCreationRequests {
 private final IdempotencyRepository requests;
 ProjectCreationRequests(IdempotencyRepository requests){this.requests=requests;}
 public Optional<String> replay(UUID workspace,UUID actor,String key,String hash,Instant now){return requests.replay(workspace,actor,route(workspace),key,hash,now);}
 public void remember(UUID workspace,UUID actor,String key,String hash,String response,Instant now){requests.remember(workspace,actor,route(workspace),key,hash,response,201,now);}
 private static String route(UUID workspace){return "/api/v1/workspaces/"+workspace+"/projects";}
}
