package com.ayaantrix.collector.visibility.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

public final class StatusEmbedPage {
    private StatusEmbedPage() {}

    private static final String STYLE =
            "body{font:16px"
                + " system-ui,sans-serif;color:#0a1a2f;background:#f8fafc;margin:0;padding:24px}main{max-width:520px;margin:auto;background:white;padding:24px;border:1px"
                + " solid"
                + " #e2e8f0;border-radius:12px}button{background:#2563eb;color:white;border:0;border-radius:6px;padding:12px"
                + " 20px;min-height:44px;cursor:pointer}button:focus-visible{outline:3px solid"
                + " #06b6d4;outline-offset:3px}pre{font:inherit;white-space:pre-wrap}a{color:#2563eb}";
    private static final String SCRIPT =
            """
            (()=>{const id=document.body.dataset.share;let capability=new URLSearchParams(location.hash.slice(1)).get('token')||'';history.replaceState(null,'',location.pathname);let read='';const button=document.getElementById('open'),output=document.getElementById('counts');
            button.onclick=async()=>{button.disabled=true;output.textContent='Loading shared counts…';try{if(!read){const exchange=await fetch('/api/v1/status-shares/exchange',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({shareId:id,token:capability})});if(!exchange.ok)throw Error();read=(await exchange.json()).readToken;}const result=await fetch('/api/v1/status-shares/'+id+'/counts',{credentials:'omit',cache:'no-store',headers:{'X-Status-Token':read}});if(!result.ok)throw Error();const data=await result.json();output.textContent=data.alias+'\\nRequired: '+data.requiredTotal+'\\nSubmitted: '+data.submitted+'\\nApproved: '+data.approved+'\\nUpdated: '+data.updatedAt;button.textContent='Refresh counts';}catch{read='';output.textContent='This status link is unavailable, revoked or expired. Use the ordinary status link or contact its owner.';}finally{button.disabled=false;}};})();
            """;

    public static String html(UUID id) {
        return """
        <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Shared project counts</title><style>%s</style></head><body data-share="%s"><main><h1>Shared project counts</h1><p>Read-only aggregate progress. No private content.</p><button id="open">View shared status</button><pre id="counts" role="status" aria-live="polite"></pre></main><script>%s</script></body></html>
        """
                .formatted(STYLE, id, SCRIPT);
    }

    public static String policy(List<String> origins) {
        return "default-src 'none'; script-src 'sha256-"
                + hash(SCRIPT)
                + "'; style-src 'sha256-"
                + hash(STYLE)
                + "'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors "
                + (origins.isEmpty() ? "'none'" : String.join(" ", origins));
    }

    private static String hash(String value) {
        try {
            return Base64.getEncoder()
                    .encodeToString(
                            MessageDigest.getInstance("SHA-256")
                                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
