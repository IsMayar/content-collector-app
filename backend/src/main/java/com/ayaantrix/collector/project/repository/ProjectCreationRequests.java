package com.ayaantrix.collector.project.repository;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.*;
/** Project-creation subset of the reference 24-hour idempotency record. Called under the workspace lock. */
@Repository
public class ProjectCreationRequests {
    private final JdbcTemplate jdbc;
    ProjectCreationRequests(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public Optional<String> replay(UUID workspace,UUID actor,String key,String hash,Instant now){
        String route=route(workspace);jdbc.update("delete from collector.idempotency_records where principal_key=? and workspace_id=? and route_key=? and expires_at<=?",actor.toString(),workspace,route,java.sql.Timestamp.from(now));
        var rows=jdbc.queryForList("select request_hash,response_json::text from collector.idempotency_records where principal_key=? and workspace_id=? and route_key=? and idempotency_key=?",actor.toString(),workspace,route,key);
        if(rows.isEmpty())return Optional.empty();var row=rows.get(0);
        if(!hash.equals(row.get("request_hash")))throw new ApiException(HttpStatus.CONFLICT,"IDEMPOTENCY_KEY_REUSED","This request key was already used with different input.");
        return Optional.of((String)row.get("response_json"));
    }
    public void remember(UUID workspace,UUID actor,String key,String hash,String response,Instant now){
        jdbc.update("""
            insert into collector.idempotency_records(principal_key,workspace_id,route_key,idempotency_key,request_hash,response_status,response_json,expires_at,created_at,updated_at)
            values (?,?,?,?,?,201,?::jsonb,?,?,?)
            """,actor.toString(),workspace,route(workspace),key,hash,response,java.sql.Timestamp.from(now.plus(Duration.ofHours(24))),java.sql.Timestamp.from(now),java.sql.Timestamp.from(now));
    }
    private static String route(UUID w){return "/api/v1/workspaces/"+w+"/projects";}
}
