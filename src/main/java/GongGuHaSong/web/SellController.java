package GongGuHaSong.web;


import GongGuHaSong.domain.Registration;
import GongGuHaSong.domain.Sell;
import GongGuHaSong.repository.RegistrationRepository;
import GongGuHaSong.repository.SellRepository;
import GongGuHaSong.web.dto.SellSaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor //DI
@RestController //데이터 리턴 서버
public class SellController {
    //DI
    private final SellRepository SellRepository;
    private final RegistrationRepository RegistrationRepository;

    /*
    @PutMapping("/sell")
    public void sellUpdate(@RequestBody SellSaveDto dto, @RequestParam String managerId, @RequestParam String title){
        Sell sell1 = SellRepository.findOne(title, managerId);
        Sell sell2 = dto.toEntity();
        if (sell1.getManagerId().equals(managerId)) {
            SellRepository.save(sell2);
            SellRepository.delete(sell1);
        }
    }

    @GetMapping("/sell/{id}")
    public Sell findById(@PathVariable String id) {
        return SellRepository.findById(id).get();
    }
     */


    @GetMapping("/sell/all")
    public List<Sell> findAll(){
        return SellRepository.findAll();
    }

    @GetMapping("/sell")
    public int Count(@RequestParam String title){
        List registrationList = RegistrationRepository.findByTitle(title);
        int total = 0;
        for (int i=0; i<registrationList.size();i++){
            Registration registration = (Registration) registrationList.get(i);
            total = total + registration.getTotal_Count();
        }
        return total;
    }

    @PostMapping("/sell")
    public Sell save(@RequestBody SellSaveDto dto) {
        String title = dto.getTitle();
        List one = SellRepository.findByTitle(title);
        System.out.println(title);
        System.out.println(one);
        if (one.isEmpty()) {
            //@RequsetBody 어노테이션을 붙인 이유는 json 타입으로 데이터를 받기 위함.
            Sell sellEntity = SellRepository.save(dto.toEntity());
            return sellEntity;
        }
        return null;
    }
}