package GongGuHaSong.order.web.dto;

import GongGuHaSong.order.domain.Registration;
import lombok.Data;

import java.util.Date;
import java.util.List;

@Data
public class RegistrationSaveDto {
    private String title;
    private String userId;
    private String phoneNumber;
    private int total_Count;
    private List sizeCount;
    private String userName;
    private String depositTime;
    private String method;
    private String address;

    public Registration toEntity(String title) {
        Registration registration = new Registration();
        registration.setTitle(title);
        registration.setUserId(userId);
        registration.setPhoneNumber(phoneNumber);
        registration.setTotal_Count(total_Count);
        registration.setSizeCount(sizeCount);
        registration.setUserName(userName);
        registration.setDepositTime(depositTime);
        registration.setMethod(method);
        registration.setAddress(address);
        registration.setStatus("CONFIRMED");
        registration.setCreatedAt(new Date());
        return registration;
    }
}
