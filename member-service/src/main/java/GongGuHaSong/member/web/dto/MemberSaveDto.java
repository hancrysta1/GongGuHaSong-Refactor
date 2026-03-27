package GongGuHaSong.member.web.dto;

import GongGuHaSong.member.domain.Member;
import lombok.Data;

@Data
public class MemberSaveDto {
    private String pid;
    private String name;
    private String pwd;
    private String phone;
    private String email;
    private String address;

    public Member toEntity() {
        Member member = new Member();
        member.setPid(pid);
        member.setName(name);
        member.setPwd(pwd);
        member.setPhone(phone);
        member.setEmail(email);
        member.setAddress(address);
        return member;
    }
}
