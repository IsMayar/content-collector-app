package com.ayaantrix.collector.template.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Repository @Transactional(propagation=Propagation.MANDATORY)
public class TemplateWriteRepository {
    private final JdbcTemplate jdbc;
    public TemplateWriteRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
    public Map<String,Object> locked(UUID workspace,UUID id){
        return jdbc.queryForList("select t.id,t.version,coalesce(t.draft_definition,(select v.definition from collector.template_versions v where v.template_id=t.id order by v.version_no desc limit 1))::text definition from collector.templates t where t.workspace_id=? and t.id=? and not t.is_builtin for update of t",workspace,id).stream().findFirst().orElseThrow(com.ayaantrix.collector.project.security.ProjectAuthorization::missing);
    }
    public void create(UUID w,UUID id,String type,String title,String industry,String definition,Instant now){
        jdbc.update("insert into collector.templates(id,workspace_id,template_key,project_type,title,industry,is_builtin,version,draft_definition,created_at,updated_at) values(?,?,?,?,?,?,false,0,?::jsonb,?,?)",id,w,"custom."+id,type,title,industry,definition,Timestamp.from(now),Timestamp.from(now));
    }
    public void draft(UUID w,UUID id,String definition,Instant now){
        jdbc.update("update collector.templates set draft_definition=?::jsonb,version=version+1,updated_at=? where workspace_id=? and id=? and not is_builtin",definition,Timestamp.from(now),w,id);
    }
    public UUID publish(UUID w,UUID id,String definition,String title,Instant now){
        var version=jdbc.queryForObject("select coalesce(max(version_no),0)+1 from collector.template_versions where template_id=?",Integer.class,id);
        UUID result=UUID.randomUUID();
        jdbc.update("insert into collector.template_versions(id,template_id,version_no,schema_version,definition,published_at,created_at,updated_at) values(?,?,?,1,?::jsonb,?,?,?)",result,id,version,definition,Timestamp.from(now),Timestamp.from(now),Timestamp.from(now));
        jdbc.update("update collector.templates set title=?,version=version+1,updated_at=? where workspace_id=? and id=?",title,Timestamp.from(now),w,id);
        return result;
    }
}
