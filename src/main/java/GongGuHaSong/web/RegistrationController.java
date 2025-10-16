package GongGuHaSong.web;


import GongGuHaSong.domain.Registration;
import GongGuHaSong.domain.Sell;
import GongGuHaSong.repository.RegistrationRepository;
import GongGuHaSong.repository.SellRepository;
import GongGuHaSong.web.dto.RegistrationSaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RequiredArgsConstructor //DI
@RestController //데이터 리턴 서버
public class RegistrationController {

    private final RegistrationRepository RegistrationRepository;
    private final SellRepository SellRepository;

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

        // 판매 상품 정보 조회
        List<Sell> sellList = SellRepository.findByTitle(title);
        if (sellList.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "해당 상품을 찾을 수 없습니다.");
        }

        Sell sell = sellList.get(0);

        // 재고 검증
        int requestedCount = dto.getTotal_Count();
        int currentStock = sell.getStock();

        if (currentStock < requestedCount) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "재고가 부족합니다. (남은 재고: " + currentStock + "개, 요청 수량: " + requestedCount + "개)");
        }

        // 재고 차감
        sell.setStock(currentStock - requestedCount);
        SellRepository.save(sell);

        Registration registrationEntity = RegistrationRepository.save(dto.toEntity(title));
        return registrationEntity;
    }
}
