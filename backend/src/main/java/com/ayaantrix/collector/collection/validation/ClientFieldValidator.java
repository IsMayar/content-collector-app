package com.ayaantrix.collector.collection.validation;
import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import java.net.URI;
import java.util.*;
@Component
public class ClientFieldValidator {
 public void validate(JsonNode item,JsonNode value){
  if(value==null||!value.isObject()||value.toString().length()>131072)fail("value","Use a valid answer of at most 128 KiB.");
  String type=item.path("type").asText();var rules=item.path("validation");
  if(type.equals("FILE")||type.equals("IMAGE"))throw new ApiException(HttpStatus.CONFLICT,"UPLOAD_UNAVAILABLE","File collection is not available yet.");
  if(value.isEmpty())return; // Explicit clear. Required/minimum constraints apply at submission, not autosave.
  String key=switch(type){case "SHORT_TEXT","LONG_TEXT"->"text";case "URL"->"url";case "SINGLE_SELECT"->"optionKey";case "MULTI_SELECT"->"optionKeys";case "REPEATER"->"rows";default->throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT,"VALIDATION_FAILED","Unsupported answer field type.");};
  if(value.size()!=1||!value.has(key))fail("value","Use the configured answer shape.");var v=value.get(key);
  switch(type){
   case "SHORT_TEXT","LONG_TEXT"->{text(v,"value.text",rules.path("maxLength").asInt(type.equals("SHORT_TEXT")?200:10000));if(!v.asText().isEmpty()&&rules.path("format").asText().equals("email")&&!v.asText().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))fail("value.text","Enter a valid email address.");}
   case "URL"->url(v,"value.url",rules.path("allowedSchemes"));
   case "SINGLE_SELECT"->{text(v,"value.optionKey",160);if(!v.asText().isEmpty()&&!option(rules,v.asText()))fail("value.optionKey","Choose an available option.");}
   case "MULTI_SELECT"->{if(!v.isArray()||v.size()>rules.path("maxOptions").asInt(100))fail("value.optionKeys","Too many selected options.");var seen=new HashSet<String>();for(var x:v)if(!x.isString()||!option(rules,x.asText())||!seen.add(x.asText()))fail("value.optionKeys","Choose unique available options.");}
   case "REPEATER"->{if(!v.isArray()||v.size()>rules.path("maxRows").asInt(20))fail("value.rows","Too many entries.");var ids=new HashSet<UUID>();for(int i=0;i<v.size();i++){var row=v.get(i);String path="value.rows["+i+"]";if(!row.isObject()||row.size()!=2||!row.path("rowId").isString()||!row.path("values").isObject())fail(path,"Use a row identifier and values.");try{if(!ids.add(UUID.fromString(row.path("rowId").asText())))fail(path,"Each entry needs a unique identifier.");}catch(IllegalArgumentException e){fail(path,"Use a valid entry identifier.");}var columns=new HashMap<String,JsonNode>();for(var c:rules.path("columns"))columns.put(c.path("key").asText(),c);for(String ck:row.get("values").propertyNames()){var c=columns.get(ck);if(c==null)fail(path,"Unknown column.");var cell=row.get("values").get(ck);switch(c.path("type").asText()){
    case "SHORT_TEXT","LONG_TEXT"->text(cell,path+"."+ck,c.path("type").asText().equals("SHORT_TEXT")?200:10000);
    case "URL"->url(cell,path+"."+ck,null);
    case "NUMBER"->{if(!(cell.isNumber()&&Double.isFinite(cell.asDouble()))&&!(cell.isString()&&cell.asText().isEmpty()))fail(path+"."+ck,"Enter a finite number.");}
    case "SINGLE_SELECT"->{text(cell,path+"."+ck,160);if(!cell.asText().isEmpty()&&!option(c,cell.asText()))fail(path+"."+ck,"Choose an available option.");}
    case "IMAGE"->{if(!cell.isArray()||!cell.isEmpty())fail(path+"."+ck,"Image uploads are not available yet.");}
    default->fail(path,"Unsupported column.");
   }}}}
  }
 }
 private boolean option(JsonNode rules,String key){for(var o:rules.path("options"))if(o.path("key").asText().equals(key))return true;return false;}
 private void text(JsonNode v,String path,int max){if(!v.isString()||v.asText().codePointCount(0,v.asText().length())>max)fail(path,"Enter text within the configured length.");}
 private void url(JsonNode v,String path,JsonNode schemes){text(v,path,2048);if(v.asText().isEmpty())return;try{var uri=new URI(v.asText());String scheme=uri.getScheme();if(uri.getHost()==null||uri.getUserInfo()!=null||scheme==null||!(scheme.equalsIgnoreCase("https")||scheme.equalsIgnoreCase("http")))fail(path,"Enter an HTTP or HTTPS URL without credentials.");if(schemes!=null){boolean found=false;for(var s:schemes)if(s.asText().equalsIgnoreCase(scheme))found=true;if(!found)fail(path,"Use an allowed URL scheme.");}}catch(java.net.URISyntaxException e){fail(path,"Enter a valid URL.");}}
 private static final class InvalidAnswer extends ApiException {
  private final String path;private final String message;
  InvalidAnswer(String path,String message){super(HttpStatus.UNPROCESSABLE_CONTENT,"VALIDATION_FAILED",path+": "+message);this.path=path;this.message=message;}
  @Override public List<Map<String,String>> getErrors(){return List.of(Map.of("fieldPath",path,"message",message));}
 }
 private static void fail(String path,String message){throw new InvalidAnswer(path,message);}
}
