package com.ayaantrix.collector.auth.dto;
import jakarta.validation.constraints.*;
public record LoginRequest(@NotBlank @Email @Size(max=254) String email,@NotBlank @Size(max=128) String password){
    public LoginRequest{if(email!=null)email=email.strip();}
    @Override public String toString(){return "LoginRequest[redacted]";}
}
