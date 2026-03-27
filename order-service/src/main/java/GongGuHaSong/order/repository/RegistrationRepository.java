package GongGuHaSong.order.repository;

import GongGuHaSong.order.domain.Registration;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface RegistrationRepository extends MongoRepository<Registration, String> {
    List<Registration> findByTitle(String title);
}
