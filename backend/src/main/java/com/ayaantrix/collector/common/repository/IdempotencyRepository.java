package com.ayaantrix.collector.common.repository;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.time.*;
import java.util.*;
@Repository
public class IdempotencyRepository {
 private final JdbcTemplate jdbc;
 public IdempotencyRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public static void validKey(String key){if(key==null || !key.matches("[a-zA-Z0-9._:-]{1,180}"))throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_FAILED","A valid Idempotency-Key is required.");}
 public static String hash(String value){try{return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException("Request hashing unavailable.");}}
 public Optional<String> replay(UUID workspace,UUID actor,String route,String key,String hash,Instant now){
  validKey(key);jdbc.update("delete from collector.idempotency_records where principal_key=? and workspace_id=? and route_key=? and expires_at<=?",actor.toString(),workspace,route,java.sql.Timestamp.from(now));
  var rows=jdbc.queryForList("select request_hash,response_json::text from collector.idempotency_records where principal_key=? and workspace_id=? and route_key=? and idempotency_key=?",actor.toString(),workspace,route,key);
  if(rows.isEmpty())return Optional.empty();var row=rows.getFirst();if(!hash.equals(row.get("request_hash")))throw new ApiException(HttpStatus.CONFLICT,"IDEMPOTENCY_KEY_REUSED","This request key was already used with different input.");return Optional.of((String)row.get("response_json"));
 }
 public void remember(UUID workspace,UUID actor,String route,String key,String hash,String response,int status,Instant now){jdbc.update("""
 insert into collector.idempotency_records(principal_key,workspace_id,route_key,idempotency_key,request_hash,response_status,response_json,expires_at,created_at,updated_at)
 values(?,?,?,?,?,?,?::jsonb,?,?,?)
 """,actor.toString(),workspace,route,key,hash,status,response,java.sql.Timestamp.from(now.plus(Duration.ofHours(24))),java.sql.Timestamp.from(now),java.sql.Timestamp.from(now));}
}
