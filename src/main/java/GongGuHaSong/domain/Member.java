package GongGuHaSong.domain;

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

    @Builder
    public Member() {
        this.pid = pid;
        this.name = name;
        this.pwd = pwd;
        this.phone = phone;
        this.email = email;
        this.address = address;
    }

    public void update(String pwd, String phone, String email, String address) {
        this.pwd = pwd;
        this.phone = phone;
        this.email = email;
        this.address = address;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }
    public String getPid() {
        return pid;
    }

    public void setPid(String pid) {
        this.pid = pid;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPwd() {
        return pwd;
    }

    public void setPwd(String pwd) {
        this.pwd = pwd;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }


    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }
}
