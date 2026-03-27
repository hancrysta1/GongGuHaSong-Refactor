package GongGuHaSong.search.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.elasticsearch.repository.config.EnableElasticsearchRepositories;

@Configuration
@EnableElasticsearchRepositories(basePackages = "GongGuHaSong.search.repository")
public class ElasticsearchConfig {
}
