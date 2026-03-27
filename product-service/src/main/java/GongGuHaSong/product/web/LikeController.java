package GongGuHaSong.product.web;

import GongGuHaSong.product.domain.Like;
import GongGuHaSong.product.repository.LikeRepository;
import GongGuHaSong.product.web.dto.LikeSaveDto;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RequiredArgsConstructor
@RestController
public class LikeController {

    private final LikeRepository likeRepository;

    @GetMapping("/my/like")
    public List<Like> findAll() {
        return likeRepository.findAll();
    }

    @GetMapping("/my/like/{pid}")
    public List<Like> findByPid(@PathVariable String pid) {
        return likeRepository.findByPid(pid);
    }

    @PostMapping("/my/like")
    public Like save(@RequestBody LikeSaveDto dto) {
        return likeRepository.save(dto.toEntity());
    }

    @DeleteMapping("/my/like/{id}")
    public void delete(@PathVariable String id) {
        likeRepository.deleteById(id);
    }
}
