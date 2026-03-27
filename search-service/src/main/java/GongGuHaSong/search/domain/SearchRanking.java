package GongGuHaSong.search.domain;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class SearchRanking {
    private int rank;
    private String keyword;
    private long searchCount;
    private long orderCount;
    private double score;
    private String changeDirection; // UP, DOWN, NEW, SAME
}
