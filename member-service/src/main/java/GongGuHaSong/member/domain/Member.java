package GongGuHaSong.member.domain;

import lombok.Builder;
import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Data
@Document(collection = "member")
public class Member {
    @Id
    private String pid;
    private String name;
    private String pwd;
    private String phone;
    private String email;
    private String address;

    public void update(String pwd, String phone, String email, String address) {
        this.pwd = pwd;
        this.phone = phone;
        this.email = email;
        this.address = address;
    }
}
