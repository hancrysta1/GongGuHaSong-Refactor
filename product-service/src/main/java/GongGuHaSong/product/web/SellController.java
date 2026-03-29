package GongGuHaSong.product.web;

import GongGuHaSong.product.domain.Sell;
import GongGuHaSong.product.event.ProductEventProducer;
import GongGuHaSong.product.repository.SellRepository;
import GongGuHaSong.product.service.ProductCacheService;
import GongGuHaSong.product.web.dto.SellSaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RequiredArgsConstructor
@RestController
public class SellController {

    private final SellRepository sellRepository;
    private final ProductCacheService productCacheService;
    private final ProductEventProducer productEventProducer;

    @GetMapping("/sell")
    public List<Sell> findByTitle(@RequestParam String title) {
        return sellRepository.findByTitle(title);
    }

    @GetMapping("/sell/{id}")
    public Sell findById(@PathVariable String id) {
        // Check Redis cache first
        Sell cached = productCacheService.getCachedProduct(id);
        if (cached != null) {
            return cached;
        }

        Sell sell = sellRepository.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "공구를 찾을 수 없습니다."));

        // Cache the result
        productCacheService.cacheProduct(sell);
        return sell;
    }

    @GetMapping("/sell/{id}/order-count")
    public int getOrderCount(@PathVariable String id) {
        Sell sell = sellRepository.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "공구를 찾을 수 없습니다."));
        return productCacheService.getOrderCount(sell.getTitle());
    }

    @PostMapping("/sell/{id}/stock")
    public Sell decrementStock(@PathVariable String id, @RequestParam int amount) {
        Sell sell = sellRepository.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "공구를 찾을 수 없습니다."));

        int newStock = sell.getStock() - amount;
        if (newStock < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "재고가 부족합니다. (현재 재고: " + sell.getStock() + "개, 요청 수량: " + amount + "개)");
        }

        sell.setStock(newStock);
        Sell saved = sellRepository.save(sell);
        productCacheService.evictProduct(id);
        return saved;
    }

    @PostMapping("/sell/{id}/stock/restore")
    public Sell restoreStock(@PathVariable String id, @RequestParam int amount) {
        Sell sell = sellRepository.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "공구를 찾을 수 없습니다."));

        sell.setStock(sell.getStock() + amount);
        Sell saved = sellRepository.save(sell);
        productCacheService.evictProduct(id);
        return saved;
    }

    @PutMapping("/sell/{id}")
    public Sell update(@PathVariable String id, @RequestBody SellSaveDto dto) {
        Sell existingSell = sellRepository.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "공구를 찾을 수 없습니다."));

        if (dto.getStock() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "재고는 0 이상이어야 합니다.");
        }

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

        Sell saved = sellRepository.save(existingSell);

        // Evict cache on update
        productCacheService.evictProduct(id);

        // ES 재인덱싱을 위한 이벤트 발행
        productEventProducer.sendProductEvent(saved, "UPDATED");

        return saved;
    }

    @GetMapping("/sell/all")
    public List<Sell> findAll() {
        return sellRepository.findAll();
    }

    @PostMapping("/sell")
    public Sell save(@RequestBody SellSaveDto dto) {
        String title = dto.getTitle();
        String managerId = dto.getManagerId();
        int stock = dto.getStock();

        if (stock < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "재고는 0 이상이어야 합니다. (현재 재고: " + stock + "개)");
        }

        List<Sell> existing = sellRepository.findByTitleAndManagerId(title, managerId);
        if (existing.isEmpty()) {
            Sell saved = sellRepository.save(dto.toEntity());

            // Cache the newly created product
            productCacheService.cacheProduct(saved);

            // ES 인덱싱을 위한 이벤트 발행
            productEventProducer.sendProductEvent(saved, "CREATED");

            return saved;
        }

        throw new ResponseStatusException(HttpStatus.CONFLICT,
            "이미 동일한 제목의 공구가 등록되어 있습니다. (판매자: " + managerId + ", 제목: " + title + ")");
    }
}
