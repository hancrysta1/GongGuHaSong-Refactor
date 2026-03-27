package GongGuHaSong.member.web.dto;

import lombok.Data;

@Data
public class MemberUpdateRequestDto {
    private String pwd;
    private String phone;
    private String email;
    private String address;
}
