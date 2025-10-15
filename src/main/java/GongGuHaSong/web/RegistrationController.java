package GongGuHaSong.web;


import GongGuHaSong.domain.Registration;
import GongGuHaSong.repository.RegistrationRepository;
import GongGuHaSong.web.dto.RegistrationSaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor //DI
@RestController //데이터 리턴 서버
public class RegistrationController {

    private final RegistrationRepository RegistrationRepository;


    @GetMapping("/order")
    public List<Registration> findAll(@RequestParam String title){
        return RegistrationRepository.findByTitle(title);
    }

    @GetMapping("/order/all")
    public List<Registration> findAll(){
        return RegistrationRepository.findAll();
    }

    @PostMapping("/order")
    public Registration save(@RequestBody RegistrationSaveDto dto, @RequestParam String title) {
        //@RequsetBody 어노테이션을 붙인 이유는 json 타입으로 데이터를 받기 위함.
        Registration registrationEntity = RegistrationRepository.save(dto.toEntity(title));
        return registrationEntity;
    }
}
