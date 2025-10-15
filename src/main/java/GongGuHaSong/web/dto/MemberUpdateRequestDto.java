package GongGuHaSong.web.dto;


import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;

@Getter
@NoArgsConstructor
public class MemberUpdateRequestDto {
    @Id
    private String pid;
    private String pwd;
    private String phone;
    private String email;
    private String address;

    @Builder
    public MemberUpdateRequestDto(String pwd, String phone, String email, String address) {
        this.pwd = pwd;
        this.phone = phone;
        this.email = email;
        this.address = address;
    }

//이걸 이제 Service로 넘겨줄 예정!

}