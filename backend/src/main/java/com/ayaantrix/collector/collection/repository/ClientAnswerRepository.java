package com.ayaantrix.collector.collection.repository;
import com.ayaantrix.collector.collection.dto.ClientAnswerDtos.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.*;
@Repository
public class ClientAnswerRepository {
 public record Draft(Answer answer,UUID operation,String hash,UUID contact){}
 private final JdbcTemplate jdbc;private final JsonMapper json;
 public ClientAnswerRepository(JdbcTemplate jdbc,JsonMapper json){this.jdbc=jdbc;this.json=json;}
 public Map<UUID,Draft> drafts(UUID w,UUID p){var result=new HashMap<UUID,Draft>();jdbc.query("select * from collector.answers where workspace_id=? and project_id=?",(org.springframework.jdbc.core.RowCallbackHandler)rs->{UUID id=rs.getObject("item_id",UUID.class);result.put(id,new Draft(new Answer(id,json.readTree(rs.getString("value_json")),rs.getLong("version"),rs.getTimestamp("updated_at").toInstant()),rs.getObject("save_operation_id",UUID.class),rs.getString("request_hash"),rs.getObject("updated_by_contact_id",UUID.class)));},w,p);return result;}
 public void save(UUID w,UUID p,UUID item,UUID contact,Save input,String hash,Instant now){
  int n=jdbc.update("""
   insert into collector.answers(workspace_id,project_id,item_id,value_json,version,structure_version,updated_by_contact_id,save_operation_id,request_hash,created_at,updated_at)
   values(?,?,?,?::jsonb,1,?,?,?,?,?,?) on conflict(item_id) do update set value_json=excluded.value_json,version=collector.answers.version+1,
   structure_version=excluded.structure_version,updated_by_contact_id=excluded.updated_by_contact_id,save_operation_id=excluded.save_operation_id,request_hash=excluded.request_hash,updated_at=excluded.updated_at
   where collector.answers.workspace_id=excluded.workspace_id and collector.answers.project_id=excluded.project_id and collector.answers.version=?
   """,w,p,item,input.value().toString(),input.expectedStructureVersion(),contact,input.saveOperationId(),hash,Timestamp.from(now),Timestamp.from(now),input.expectedVersion());
  if(n!=1)throw new IllegalStateException("Draft conditional update failed under project lock");
  jdbc.update("update collector.projects set version=version+1,updated_at=? where workspace_id=? and id=?",Timestamp.from(now),w,p);
  jdbc.update("update collector.items set state='DRAFT',version=version+1,updated_at=? where workspace_id=? and project_id=? and id=?",Timestamp.from(now),w,p,item);
 }
}
