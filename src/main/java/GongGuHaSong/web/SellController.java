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

    @GetMapping("/sell/{id}")
    public Sell findById(@PathVariable String id) {
        return SellRepository.findById(id).orElseThrow(() ->
            new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND,
                "공구를 찾을 수 없습니다."
            )
        );
    }

    @PutMapping("/sell/{id}")
    public Sell update(@PathVariable String id, @RequestBody SellSaveDto dto) {
        Sell existingSell = SellRepository.findById(id).orElseThrow(() ->
            new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.NOT_FOUND,
                "공구를 찾을 수 없습니다."
            )
        );

        // 재고 검증
        if (dto.getStock() < 0) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "재고는 0 이상이어야 합니다."
            );
        }

        // 기존 데이터 업데이트
        existingSell.setTitle(dto.getTitle());
        existingSell.setPrice(dto.getPrice());
        existingSell.setMin_count(dto.getMin_count());
        existingSell.setStock(dto.getStock());
        existingSell.setInfo(dto.getInfo());
        existingSell.setStartDate(dto.getStartDate());
        existingSell.setFinishDate(dto.getFinishDate());
        existingSell.setStartResearch(dto.getStartResearch());
        existingSell.setFinishResearch(dto.getFinishResearch());
        existingSell.setNotice(dto.getNotice());
        existingSell.setCategory(dto.getCategory());
        existingSell.setMainPhoto(dto.getMainPhoto());
        existingSell.setSizePhoto(dto.getSizePhoto());
        existingSell.setAccountName(dto.getAccountName());
        existingSell.setAccount(dto.getAccount());

        return SellRepository.save(existingSell);
    }


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
        String managerId = dto.getManagerId();
        int stock = dto.getStock();

        // 재고 검증
        if (stock < 0) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.BAD_REQUEST,
                "재고는 0 이상이어야 합니다. (현재 재고: " + stock + "개)"
            );
        }

        // 제목 + 판매자 ID로 중복 체크
        List<Sell> existing = SellRepository.findByTitleAndManagerId(title, managerId);

        System.out.println("Title: " + title);
        System.out.println("Manager ID: " + managerId);
        System.out.println("Existing: " + existing);

        if (existing.isEmpty()) {
            //@RequsetBody 어노테이션을 붙인 이유는 json 타입으로 데이터를 받기 위함.
            Sell sellEntity = SellRepository.save(dto.toEntity());
            return sellEntity;
        }

        // 중복일 경우 null 대신 예외 발생
        throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.CONFLICT,
            "이미 동일한 제목의 공구가 등록되어 있습니다. (판매자: " + managerId + ", 제목: " + title + ")"
        );
    }
}