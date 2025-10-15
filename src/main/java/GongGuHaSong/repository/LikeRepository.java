package GongGuHaSong.repository;

import GongGuHaSong.domain.Like;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface LikeRepository extends MongoRepository<Like,String> {
    List<Like> findByPid(String pid);
    List<Like> findAll();
}
