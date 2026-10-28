# ACME 보험 DB 온톨로지 (처음부터 구축)

- 입력: `data/schema.ddl`(13개 테이블 DDL), `data/acme.db`(SQLite, 13개 테이블, 총 54행)
- 방법: 「온톨로지 개발 101」(Noy & McGuinness) 7단계
- 원칙: 공개 보험 도메인 온톨로지는 가져오지 않음. 모든 클래스·관계는 DDL 구조와 DB 실측값에서만 도출하고, 근거가 없는 해석은 **[추정]** 으로 표시함.
- 네임스페이스

```turtle
@prefix ins:  <https://example.org/acme/ontology#> .   # 클래스·속성
@prefix res:  <https://example.org/acme/resource/> .   # 인스턴스 IRI
@prefix code: <https://example.org/acme/code/> .       # 코드값 (SKOS)
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix sh:   <http://www.w3.org/ns/shacl#> .
```

### DB 사전 조사에서 확인한 사실 (이후 모든 단계의 근거)

| 사실 | 근거 |
|---|---|
| DDL은 FK 대상으로 11개 테이블을 참조하지만 DB와 DDL 어디에도 정의가 없음: `Agreement`, `Party`, `Party_Role`, `Coverage`, `Policy_Coverage_Part`, `Insurable_Object`, `Occurrence`, `Geographic_Location`, `Claim_Payment`, `Claim_Reserve`, `Claim_Offer` | `sqlite_master` 조회 결과 0건 |
| SQLite 테이블에 컬럼 타입이 없어서 ID·번호가 모두 `REAL`로 저장됨 (`1.0`, `31003000336.0`). 소수부가 있는 값은 없음 | `typeof()`, 검증 C19 |
| 날짜는 `YYYY-MM-DD` 텍스트로 저장됨 | `typeof(Claim_Open_Date)='text'` |
| 값이 하나도 없는 컬럼이 많음 (아래 ⑦에 컬럼별로 표시) | `quote()` 집계 |
| DDL의 `NOT NULL` 제약 4곳을 DB가 위반함 | 검증 C13 |

---

## ① 답해야 할 질문 (Competency Questions)

온톨로지 범위를 정하는 질문 5개. 실제 데이터로 답할 수 있는 것만 골랐음.

| # | 질문 | 이 질문에 필요한 개념 |
|---|---|---|
| CQ1 | 증권번호 X의 **계약자**와 **대리인**은 누구인가? | 증권, 당사자, 당사자 역할 |
| CQ2 | 증권별·담보기간별 **연간 보험료**는 얼마인가? | 증권, 담보기간(담보상세), 계약금액, 보험료 |
| CQ3 | 각 클레임은 **어떤 재해**로 발생했고, **어느 증권의 어느 담보기간**으로 처리됐으며, 처리하는 데 **며칠** 걸렸나? | 클레임, 재해, 클레임-담보 연결, 일자 |
| CQ4 | 클레임별 금액을 **손해/비용**과 **지급/준비금**으로 나누면 각각 얼마인가? | 클레임금액과 그 2×2 하위분류 |
| CQ5 | 증권·담보기간별 **손해율**(손해지급 ÷ 보험료)은 얼마인가? | CQ2 + CQ3 + CQ4의 결합 |

범위 밖으로 둔 것: 재해 유형 코드, 지역별 집계, 담보 종목별 집계. 해당 컬럼(`Catastrophe_Type_Code`, `Geographic_Location_Identifier`, `Coverage_Identifier`, `Coverage_Part_Code`)이 전부 NULL이라 질문을 세워도 답할 수 없음.

---

## ② 재사용할 표준

도메인 온톨로지는 가져오지 않고, 도메인 중립적인 W3C 표준만 씀.

| 표준 | 용도 | 이유 |
|---|---|---|
| RDF / RDFS | 트리플 모델, `rdfs:label`, `rdfs:subClassOf`, `rdfs:domain/range` | 기반 |
| OWL 2 | 계층, 서로소(disjoint), 함수형 속성, 속성 체인, 카디널리티 | ④⑤⑥의 의미 표현 |
| XSD 데이터타입 | `xsd:date`, `xsd:decimal`, `xsd:string`, `xsd:integer` | DB의 REAL/TEXT를 정확한 타입으로 바꾸기 위해 |
| SKOS | 코드값(`PH`, `AG`, `Year`)을 `skos:Concept`로 관리 | 코드 목록을 클래스가 아니라 통제어휘로 다룸. 코드 정의 테이블(`Party_Role`)이 없으므로 `skos:notation`에 원래 코드값을 남겨 둠 |
| SHACL | 데이터 제약(필수값, 값 목록, 날짜 순서 등) | OWL은 열린 세계 가정이라 "빠지면 오류"를 표현하지 못함 → 검증은 SHACL로 |
| R2RML (개념) | ⑦ 매핑을 이 형식으로 옮길 수 있게 IRI 템플릿 방식으로 기술 | 관계형→RDF 매핑의 W3C 표준 |

`dcterms`, `OWL-Time`, `FOAF` 같은 어휘는 쓸 근거 데이터(작성자, 시간 간격 객체, 사람 이름)가 DB에 없어서 넣지 않았음.

---

## ③ 용어 나열

DDL의 테이블명·컬럼명을 하나도 빠뜨리지 않고 풀어서 적은 뒤, 개념(명사)·속성(값)·관계(참조)로 나눴음.

**개념이 될 후보 (명사)**

| 용어 | 출처 | 데이터 존재 |
|---|---|---|
| 계약 Agreement | `Policy` FK, `Agreement_Party_Role` | 테이블 없음 |
| 보험증권 Policy | `Policy` | 2건 |
| 당사자 Party | `Agreement_Party_Role.Party_Identifier` | ID만 있음 (2명) |
| 당사자 역할 Party Role | `Party_Role_Code` | 코드 2종 |
| 계약-당사자 역할 부여 | `Agreement_Party_Role` | 4건 |
| 담보상세(담보기간) Policy Coverage Detail | `Policy_Coverage_Detail` | 6건 |
| 담보 Coverage / 담보파트 Coverage Part | FK | 테이블 없음, 값 NULL |
| 보험목적물 Insurable Object | FK | ID만 있음 (1, 2) |
| 지역 Geographic Location | FK | 값 NULL |
| 계약금액 Policy Amount | `Policy_Amount` | 12건 |
| 보험료 Premium | `Premium` | 6건 |
| 재해 Catastrophe | `Catastrophe` | 4건 |
| 사고 Occurrence | `Claim.Occurrence_Identifier` | ID만 있음 |
| 클레임 Claim | `Claim` | 2건 |
| 클레임금액 Claim Amount | `Claim_Amount` | 8건 |
| 클레임 지급 / 클레임 준비금 | `Loss_Payment` 등의 FK 대상 | 테이블 없음 |
| 손해지급 / 비용지급 / 손해준비금 / 비용준비금 | 서브타입 테이블 4개 | 각 2건 |
| 클레임 제안 Claim Offer | FK | 값 NULL |

**속성이 될 후보 (값)**: 증권번호, 클레임번호, 하위클레임번호, 개시일, 만기일, 클레임 개시/종결/재개/접수일, 클레임 메이드 일자, 클레임 메이드 프로그램 편입일, 상태코드, 금액, 금액유형코드, 보험유형코드, 경과 시작/종료일, 담보 설명, 담보 포함/제외 코드, 재해명, 재해유형코드, 업계/회사 재해코드, 클레임 설명, 이벤트 일자.

**관계가 될 후보 (참조)**: 모든 `FOREIGN KEY`, 그리고 연결 전용 테이블 `Claim_Coverage`. 이 테이블에는 FK 외의 컬럼이 없어서 클래스가 아니라 **관계**로 분류함.

---

## ④ 클래스와 계층

### 설계 결정

1. **`Policy ⊑ Agreement`**: DDL에서 `Policy.Policy_Identifier`가 `Agreement.Agreement_Identifier`를 참조하는 공유 PK 구조. 증권은 계약의 한 종류임. `Agreement_Party_Role`은 Policy가 아니라 Agreement를 가리키므로 상위 클래스가 있어야 함.
2. **클레임금액은 2축 분류**: 서브타입 테이블 4개(`Loss_Payment`, `Expense_Payment`, `Loss_Reserve`, `Expense_Reserve`)는 DDL에서 `Claim_Payment`와 `Claim_Reserve`(없는 테이블)를 거쳐 `Claim_Amount`를 상속함. 이름을 보면 서로 독립인 두 축이 섞여 있음.
   - 축 A (돈의 상태): 지급 `ClaimPayment` / 준비금 `ClaimReserve`
   - 축 B (돈의 성격): 손해 `LossAmount` / 비용 `ExpenseAmount`
   - 리프 클래스 4개가 축마다 하나씩 상위를 가짐(다중 상속). 이렇게 하면 "손해 금액 전체"나 "지급 전체"를 SQL 서브타입 테이블 이름에 기대지 않고 클래스 하나로 질의할 수 있음.
3. **`Premium ⊑ PolicyAmount`**: `Premium` 테이블은 `Policy_Amount`의 공유 PK 서브타입.
   보험료가 아닌 나머지 6건(금액 1,000,000 / 600,000)은 보상한도로 보이지만 **[추정]** 일 뿐 DB 근거가 없음. 그래서 하위 클래스를 만들지 않고 `PolicyAmount`로만 둠.
4. **`Claim_Coverage`는 클래스가 아님**: 속성 없는 연결 테이블이라 ⑤의 관계 `ins:claimCoveredBy`로 처리함.
5. **`Agreement_Party_Role`은 클래스로 둠(n항 관계의 사물화)**: 계약·당사자·역할코드·유효기간 네 요소를 묶어야 하므로 단순 관계로는 표현할 수 없음. 대신 질의를 쉽게 하려고 ⑤에서 지름길 관계 `hasPolicyholder`, `hasAgent`를 함께 정의함.
6. **DB에 테이블이 없는 개념**(`Party`, `InsurableObject`, `Occurrence`, `Coverage`, `CoveragePart`, `GeographicLocation`, `ClaimOffer`)도 클래스로 선언함. FK 값(ID)으로 인스턴스 IRI는 만들 수 있고, 나중에 테이블이 생기면 속성만 추가하면 됨.

### 계층도

```
owl:Thing
├── ins:Agreement                       계약
│   └── ins:Policy                      보험증권
├── ins:Party                           당사자
├── ins:AgreementPartyRole              계약-당사자 역할 부여 (사물화)
├── ins:PolicyCoverageDetail            담보상세 = 증권 × 목적물 × 담보기간
├── ins:Coverage                        담보 (데이터 없음)
├── ins:CoveragePart                    담보파트 (데이터 없음)
├── ins:InsurableObject                 보험목적물
├── ins:GeographicLocation              지역 (데이터 없음)
├── ins:PolicyAmount                    계약금액
│   └── ins:Premium                     보험료
├── ins:Catastrophe                     재해
├── ins:Occurrence                      사고
├── ins:Claim                           클레임
├── ins:ClaimOffer                      클레임 제안 (데이터 없음)
└── ins:ClaimAmount                     클레임금액
    ├── ins:ClaimPayment     (축 A)     지급
    │   ├── ins:LossPayment             손해지급   ⊑ LossAmount
    │   └── ins:ExpensePayment          비용지급   ⊑ ExpenseAmount
    ├── ins:ClaimReserve     (축 A)     준비금
    │   ├── ins:LossReserve             손해준비금 ⊑ LossAmount
    │   └── ins:ExpenseReserve          비용준비금 ⊑ ExpenseAmount
    ├── ins:LossAmount       (축 B)     손해
    └── ins:ExpenseAmount    (축 B)     비용

skos:ConceptScheme
├── code:PartyRoleScheme   { code:PH, code:AG }
└── code:PolicyAmountTypeScheme { code:Year }
```

```turtle
ins:Agreement            a owl:Class ; rdfs:label "계약"@ko, "Agreement"@en .
ins:Policy               a owl:Class ; rdfs:subClassOf ins:Agreement ; rdfs:label "보험증권"@ko .
ins:Party                a owl:Class ; rdfs:label "당사자"@ko .
ins:AgreementPartyRole   a owl:Class ; rdfs:label "계약-당사자 역할 부여"@ko .
ins:PolicyCoverageDetail a owl:Class ; rdfs:label "담보상세(담보기간)"@ko .
ins:Coverage             a owl:Class ; rdfs:label "담보"@ko .
ins:CoveragePart         a owl:Class ; rdfs:label "담보파트"@ko .
ins:InsurableObject      a owl:Class ; rdfs:label "보험목적물"@ko .
ins:GeographicLocation   a owl:Class ; rdfs:label "지역"@ko .
ins:PolicyAmount         a owl:Class ; rdfs:label "계약금액"@ko .
ins:Premium              a owl:Class ; rdfs:subClassOf ins:PolicyAmount ; rdfs:label "보험료"@ko .
ins:Catastrophe          a owl:Class ; rdfs:label "재해"@ko .
ins:Occurrence           a owl:Class ; rdfs:label "사고"@ko .
ins:Claim                a owl:Class ; rdfs:label "클레임"@ko .
ins:ClaimOffer           a owl:Class ; rdfs:label "클레임 제안"@ko .
ins:ClaimAmount          a owl:Class ; rdfs:label "클레임금액"@ko .

ins:ClaimPayment   a owl:Class ; rdfs:subClassOf ins:ClaimAmount ; rdfs:label "클레임 지급"@ko .
ins:ClaimReserve   a owl:Class ; rdfs:subClassOf ins:ClaimAmount ; rdfs:label "클레임 준비금"@ko .
ins:LossAmount     a owl:Class ; rdfs:subClassOf ins:ClaimAmount ; rdfs:label "손해 금액"@ko .
ins:ExpenseAmount  a owl:Class ; rdfs:subClassOf ins:ClaimAmount ; rdfs:label "비용 금액"@ko .

ins:LossPayment    a owl:Class ; rdfs:subClassOf ins:ClaimPayment, ins:LossAmount    ; rdfs:label "손해지급"@ko .
ins:ExpensePayment a owl:Class ; rdfs:subClassOf ins:ClaimPayment, ins:ExpenseAmount ; rdfs:label "비용지급"@ko .
ins:LossReserve    a owl:Class ; rdfs:subClassOf ins:ClaimReserve, ins:LossAmount    ; rdfs:label "손해준비금"@ko .
ins:ExpenseReserve a owl:Class ; rdfs:subClassOf ins:ClaimReserve, ins:ExpenseAmount ; rdfs:label "비용준비금"@ko .

# 코드값 (Party_Role 테이블이 없어서 의미는 [추정], 원래 코드값은 notation에 보존)
code:PartyRoleScheme a skos:ConceptScheme ; rdfs:label "당사자 역할 코드"@ko .
code:PH a skos:Concept ; skos:inScheme code:PartyRoleScheme ; skos:notation "PH" ;
        skos:prefLabel "계약자"@ko, "Policyholder"@en .
code:AG a skos:Concept ; skos:inScheme code:PartyRoleScheme ; skos:notation "AG" ;
        skos:prefLabel "대리인"@ko, "Agent"@en .
code:PolicyAmountTypeScheme a skos:ConceptScheme ; rdfs:label "계약금액 유형 코드"@ko .
code:Year a skos:Concept ; skos:inScheme code:PolicyAmountTypeScheme ; skos:notation "Year" ;
        skos:prefLabel "연간"@ko ;
        skos:scopeNote "DB에서 Premium 행에만 나타남(검증 C4), 해당 담보기간은 모두 364~365일(검증 C15)"@ko .
```

---

## ⑤ 관계 (속성)

### 객체 속성 (개체 ↔ 개체)

| 속성 | domain → range | 근거 FK / 컬럼 | 특성 |
|---|---|---|---|
| `ins:hasCoverageDetail` | Policy → PolicyCoverageDetail | `PCD.Policy_Identifier` | 역: `ins:coverageDetailOf` (함수형) |
| `ins:coversObject` | PolicyCoverageDetail → InsurableObject | `PCD.Insurable_Object_Identifier` | 함수형 |
| `ins:forCoverage` | PolicyCoverageDetail → Coverage | `PCD.Coverage_Identifier` | 함수형 |
| `ins:inCoveragePart` | PolicyCoverageDetail → CoveragePart | `PCD.(Coverage_Part_Code, Policy_Identifier)` | 함수형 |
| `ins:policyLocatedIn` | Policy → GeographicLocation | `Policy.Geographic_Location_Identifier` | 함수형 |
| `ins:amountOfPolicy` | PolicyAmount → Policy | `Policy_Amount.Policy_Identifier` | 함수형 |
| `ins:amountForCoverageDetail` | PolicyAmount → PolicyCoverageDetail | `Policy_Amount.(Effective_Date, PCD_Identifier)` | 함수형 |
| `ins:amountForObject` | PolicyAmount → InsurableObject | `Policy_Amount.Insurable_Object_Identifier` | 함수형 |
| `ins:amountInLocation` | PolicyAmount → GeographicLocation | `Policy_Amount.Geographic_Location_Identifier` | 함수형 |
| `ins:roleInAgreement` | AgreementPartyRole → Agreement | `APR.Agreement_Identifier` | 함수형 |
| `ins:rolePlayedBy` | AgreementPartyRole → Party | `APR.Party_Identifier` | 함수형 |
| `ins:roleType` | AgreementPartyRole → skos:Concept | `APR.Party_Role_Code` | 함수형 |
| `ins:hasPolicyholder` | Agreement → Party | APR에서 `Party_Role_Code='PH'`인 행 | 지름길(파생) |
| `ins:hasAgent` | Agreement → Party | APR에서 `Party_Role_Code='AG'`인 행 | 지름길(파생) |
| `ins:claimFromCatastrophe` | Claim → Catastrophe | `Claim.Catastrophe_Identifier` | 함수형 |
| `ins:claimForOccurrence` | Claim → Occurrence | `Claim.Occurrence_Identifier` | 함수형 |
| `ins:claimOnObject` | Claim → InsurableObject | `Claim.Insurable_Object_Identifier` | 함수형 |
| `ins:claimCoveredBy` | Claim → PolicyCoverageDetail | 연결 테이블 `Claim_Coverage` | 다대다 |
| `ins:claimUnderPolicy` | Claim → Policy | 속성 체인 `claimCoveredBy ∘ coverageDetailOf` | 추론 |
| `ins:amountOfClaim` | ClaimAmount → Claim | `Claim_Amount.Claim_Identifier` | 함수형, 역: `ins:hasClaimAmount` |
| `ins:amountForOffer` | ClaimAmount → ClaimOffer | `Claim_Amount.Claim_Offer_Identifier` | 함수형 |
| `ins:amountType` | PolicyAmount → skos:Concept | `Policy_Amount.Amount_Type_Code` | 함수형 |

### 데이터 속성 (개체 → 값)

| 속성 | domain | range | 컬럼 |
|---|---|---|---|
| `ins:policyNumber` | Policy | xsd:string | `Policy.Policy_Number` |
| `ins:effectiveDate` | Agreement, PolicyCoverageDetail, AgreementPartyRole, PolicyAmount | xsd:date | `*.Effective_Date` |
| `ins:expirationDate` | Agreement, PolicyCoverageDetail, AgreementPartyRole | xsd:date | `*.Expiration_Date` |
| `ins:statusCode` | Policy | xsd:string | `Policy.Status_Code` |
| `ins:coverageDescription` | PolicyCoverageDetail | xsd:string | `Coverage_Description` |
| `ins:inclusionExclusionCode` | PolicyCoverageDetail | xsd:string | `Coverage_Inclusion_Exclusion_Code` |
| `ins:amount` | PolicyAmount, ClaimAmount | xsd:decimal | `Policy_Amount`, `Claim_Amount` |
| `ins:insuranceTypeCode` | PolicyAmount, ClaimAmount | xsd:string | `Insurance_Type_Code` |
| `ins:earningBeginDate` / `ins:earningEndDate` | PolicyAmount | xsd:date | `Earning_Begin/End_Date` |
| `ins:claimNumber` | Claim | xsd:string | `Company_Claim_Number` |
| `ins:subclaimNumber` | Claim | xsd:string | `Company_Subclaim_Number` |
| `ins:claimDescription` | Claim | xsd:string | `Claim_Description` |
| `ins:claimOpenDate` / `ins:claimCloseDate` / `ins:claimReopenDate` / `ins:claimReportedDate` | Claim | xsd:date | `Claim_*_Date` |
| `ins:claimsMadeDate` / `ins:claimsMadeProgramEntryDate` | Claim | xsd:date | `Claims_Made_Date`, `Entry_Into_Claims_Made_Program_Date` |
| `ins:claimStatusCode` | Claim | xsd:string | `Claim_Status_Code` |
| `ins:claimAmountTypeCode` | ClaimAmount | xsd:string | `Claim_Amount.Amount_Type_Code` |
| `ins:eventDate` | ClaimAmount | xsd:date | `Event_Date` |
| `ins:catastropheName` | Catastrophe | xsd:string | `Catastrophe_Name` |
| `ins:catastropheTypeCode` / `ins:industryCatastropheCode` / `ins:companyCatastropheCode` | Catastrophe | xsd:string | 동명 컬럼 |

번호(`policyNumber`, `claimNumber`)를 `xsd:string`으로 둔 이유: 식별자이므로 계산 대상이 아니고, DB에 `REAL`로 저장된 값을 숫자로 받으면 `3.1003000336E10` 같은 표기가 섞일 수 있음.

```turtle
ins:hasCoverageDetail a owl:ObjectProperty ; rdfs:domain ins:Policy ; rdfs:range ins:PolicyCoverageDetail ;
    owl:inverseOf ins:coverageDetailOf .
ins:coverageDetailOf  a owl:ObjectProperty, owl:FunctionalProperty .
ins:claimCoveredBy    a owl:ObjectProperty ; rdfs:domain ins:Claim ; rdfs:range ins:PolicyCoverageDetail .
ins:claimUnderPolicy  a owl:ObjectProperty ; rdfs:domain ins:Claim ; rdfs:range ins:Policy ;
    owl:propertyChainAxiom ( ins:claimCoveredBy ins:coverageDetailOf ) .
ins:amountOfClaim     a owl:ObjectProperty, owl:FunctionalProperty ;
    rdfs:domain ins:ClaimAmount ; rdfs:range ins:Claim ; owl:inverseOf ins:hasClaimAmount .
ins:hasPolicyholder   a owl:ObjectProperty ; rdfs:domain ins:Agreement ; rdfs:range ins:Party ;
    rdfs:comment "AgreementPartyRole(roleType=code:PH)에서 파생한 지름길"@ko .
ins:hasAgent          a owl:ObjectProperty ; rdfs:domain ins:Agreement ; rdfs:range ins:Party ;
    rdfs:comment "AgreementPartyRole(roleType=code:AG)에서 파생한 지름길"@ko .
ins:amount            a owl:DatatypeProperty, owl:FunctionalProperty ; rdfs:range xsd:decimal .
# (나머지 속성은 위 표와 같은 패턴으로 선언)
```

---

## ⑥ 제약

제약을 세 층으로 나눔. 각 제약이 실제 DB에서 성립하는지는 검증 쿼리 C1–C19로 확인했고, 결과는 맨 아래 「검증」에 있음.

### 6-1. OWL 공리 (추론에 쓰이는 의미)

```turtle
# 축 A, 축 B 각각 서로소
[] a owl:AllDisjointClasses ; owl:members ( ins:ClaimPayment ins:ClaimReserve ) .
[] a owl:AllDisjointClasses ; owl:members ( ins:LossAmount ins:ExpenseAmount ) .
# 리프 4개는 축 교집합과 동치 → "손해이면서 지급" 이면 자동으로 LossPayment
ins:LossPayment    owl:equivalentClass [ owl:intersectionOf ( ins:ClaimPayment ins:LossAmount ) ] .
ins:ExpensePayment owl:equivalentClass [ owl:intersectionOf ( ins:ClaimPayment ins:ExpenseAmount ) ] .
ins:LossReserve    owl:equivalentClass [ owl:intersectionOf ( ins:ClaimReserve ins:LossAmount ) ] .
ins:ExpenseReserve owl:equivalentClass [ owl:intersectionOf ( ins:ClaimReserve ins:ExpenseAmount ) ] .

# 서로 다른 최상위 개념은 겹치지 않음
[] a owl:AllDisjointClasses ; owl:members ( ins:Agreement ins:Party ins:Claim ins:ClaimAmount
     ins:PolicyAmount ins:PolicyCoverageDetail ins:Catastrophe ins:InsurableObject ) .

# 필수 관계 (DDL NOT NULL 이고 DB에서도 지켜짐)
ins:ClaimAmount          rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ins:amountOfClaim ;
                                           owl:qualifiedCardinality 1 ; owl:onClass ins:Claim ] .
ins:PolicyCoverageDetail rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ins:coverageDetailOf ;
                                           owl:qualifiedCardinality 1 ; owl:onClass ins:Policy ] ,
                                         [ a owl:Restriction ; owl:onProperty ins:coversObject ;
                                           owl:qualifiedCardinality 1 ; owl:onClass ins:InsurableObject ] .
ins:AgreementPartyRole   rdfs:subClassOf [ a owl:Restriction ; owl:onProperty ins:roleInAgreement ; owl:cardinality 1 ] ,
                                         [ a owl:Restriction ; owl:onProperty ins:rolePlayedBy ;   owl:cardinality 1 ] ,
                                         [ a owl:Restriction ; owl:onProperty ins:roleType ;       owl:cardinality 1 ] .
```

일부러 OWL에 넣지 않은 것: "모든 ClaimAmount는 네 리프 중 하나"(`owl:disjointUnionOf`). DDL은 이를 보장하지 않고 현재 데이터에서만 성립함(C1). 공리로 넣으면 리프가 없는 금액이 들어왔을 때 추론기가 존재하지 않는 리프를 가정하게 되므로, 데이터 검증 규칙(6-2 S1)으로만 둠.

### 6-2. SHACL 형태 제약 (데이터 품질 검사)

| ID | 대상 | 규칙 | 근거 | 검증 |
|---|---|---|---|---|
| S1 | ClaimAmount | 리프 4개 중 **정확히 하나**에 속함 | 서브타입 테이블 구조 | C1 ✅ |
| S2 | 서브타입 행 | 상위 행(`Claim_Amount` / `Policy_Amount`)이 존재함 | 공유 PK | C2, C3 ✅ |
| S3 | Premium | `amountType = code:Year`, 그리고 그 역도 성립 | 실측 | C4 ✅ |
| S4 | Claim | `claimCloseDate ≥ claimOpenDate` | 의미 | C5 ✅ |
| S5 | PolicyCoverageDetail | 담보기간이 증권 기간 안에 있음 | 의미 | C6 ✅ |
| S6 | Claim | 개시일이 연결된 담보기간 안에 있음 | 의미 | C7 ✅ |
| S7 | Claim | `claimOnObject` = 연결된 담보상세의 `coversObject` | 의미 | **C8 ❌ 1건 위반** |
| S8 | PolicyAmount | `amountOfPolicy` = `amountForCoverageDetail/coverageDetailOf` | 중복 FK 일관성 | C9 ✅ |
| S9 | `ins:amount` | ≥ 0 | 의미 | C10 ✅ |
| S10 | AgreementPartyRole | `roleType ∈ {code:PH, code:AG}` | 실측 코드 목록 | C11 ✅ |
| S11 | Policy | 계약자(PH)는 정확히 1명 | 의미 **[추정]** | C12 ✅ |
| S12 | PolicyCoverageDetail | 같은 증권·목적물의 담보기간은 겹치지 않음 | 의미 | C14 ✅ |
| S13 | Claim | 담보상세 연결이 최소 1개 | CQ3·CQ5 전제 | C18 ✅ |

```turtle
ins:ClaimAmountShape a sh:NodeShape ; sh:targetClass ins:ClaimAmount ;
  sh:property [ sh:path ins:amountOfClaim ; sh:minCount 1 ; sh:maxCount 1 ; sh:class ins:Claim ] ;
  sh:property [ sh:path ins:amount ; sh:datatype xsd:decimal ; sh:minInclusive 0 ] ;
  sh:xone ( [ sh:class ins:LossPayment ] [ sh:class ins:ExpensePayment ]
            [ sh:class ins:LossReserve ] [ sh:class ins:ExpenseReserve ] ) .                # S1

ins:ClaimShape a sh:NodeShape ; sh:targetClass ins:Claim ;
  sh:property [ sh:path ins:claimNumber ; sh:minCount 1 ; sh:maxCount 1 ; sh:datatype xsd:string ] ;
  sh:property [ sh:path ins:claimCoveredBy ; sh:minCount 1 ] ;                             # S13
  sh:property [ sh:path ins:claimCloseDate ; sh:maxCount 1 ; sh:datatype xsd:date ] ;
  sh:sparql [ sh:message "종결일이 개시일보다 빠름" ; sh:select """                          # S4
      SELECT $this WHERE { $this ins:claimOpenDate ?o ; ins:claimCloseDate ?c . FILTER (?c < ?o) }""" ] ,
            [ sh:message "클레임 목적물과 담보상세 목적물이 다름" ; sh:select """
      SELECT $this WHERE { $this ins:claimOnObject ?a ; ins:claimCoveredBy/ins:coversObject ?b .
                           FILTER (?a != ?b) }""" ] .                                      # S7

ins:AgreementPartyRoleShape a sh:NodeShape ; sh:targetClass ins:AgreementPartyRole ;
  sh:property [ sh:path ins:roleType ; sh:minCount 1 ; sh:maxCount 1 ; sh:in ( code:PH code:AG ) ] .   # S10

ins:PolicyShape a sh:NodeShape ; sh:targetClass ins:Policy ;
  sh:property [ sh:path ins:policyNumber ; sh:minCount 1 ; sh:maxCount 1 ] ;
  sh:property [ sh:path ins:hasPolicyholder ; sh:minCount 1 ; sh:maxCount 1 ] .           # S11
```

### 6-3. DDL에는 있지만 온톨로지에서 **완화한** 제약

DDL은 `NOT NULL`인데 DB 데이터가 이를 어김(C13). 온톨로지를 실제 데이터에 맞추려고 `minCount 0`으로 두고, 데이터를 보강할 항목으로 기록함.

| DDL 컬럼 | DDL 제약 | DB 실측 | 온톨로지 |
|---|---|---|---|
| `Agreement_Party_Role.Effective_Date` | NOT NULL, PK 일부 | 4/4 NULL | `effectiveDate` 선택값. 그래서 APR IRI에 날짜를 넣지 않음(⑦) |
| `Policy_Coverage_Detail.Coverage_Identifier` | NOT NULL | 6/6 NULL | `forCoverage` 선택값 |
| `Policy_Coverage_Detail.Coverage_Part_Code` | NOT NULL | 6/6 NULL | `inCoveragePart` 선택값 |
| `Policy_Amount.Geographic_Location_Identifier` | NOT NULL | 12/12 NULL | `amountInLocation` 선택값 |

---

## ⑦ 매핑 (테이블 · 컬럼 · 코드값)

### 7-1. 공통 변환 규칙

| 문제 | 규칙 |
|---|---|
| ID가 REAL (`1.0`) | IRI에 넣기 전에 `CAST(x AS INTEGER)` → `res:claim/1` |
| 번호가 REAL (`31003000336.0`) | `CAST(CAST(x AS INTEGER) AS TEXT)` → `"31003000336"^^xsd:string` |
| 날짜 TEXT | `"2019-01-15"^^xsd:date` (형식이 이미 ISO라 그대로 씀) |
| 금액 REAL | `xsd:decimal` |
| NULL | 트리플을 만들지 않음 |
| 복합키 (`Effective_Date`, `PCD_Identifier`) | `res:coverage-detail/{id}/{effective_date}` |

### 7-2. 테이블 → 클래스

| 테이블 | 클래스 | 주어 IRI 템플릿 | 비고 |
|---|---|---|---|
| `Policy` | `ins:Policy` (+ 추론으로 `ins:Agreement`) | `res:agreement/{Policy_Identifier}` | Agreement와 IRI를 공유해야 APR과 합쳐짐 |
| `Agreement_Party_Role` | `ins:AgreementPartyRole` | `res:agreement-role/{Agreement_Identifier}/{Party_Identifier}/{Party_Role_Code}` | Effective_Date는 전부 NULL이라 키에서 뺌 |
| `Policy_Coverage_Detail` | `ins:PolicyCoverageDetail` | `res:coverage-detail/{PCD_Identifier}/{Effective_Date}` | 복합 PK |
| `Policy_Amount` | `ins:PolicyAmount` | `res:policy-amount/{Policy_Amount_Identifier}` | |
| `Premium` | `ins:Premium` (타입만 추가) | `res:policy-amount/{Policy_Amount_Identifier}` | 상위와 같은 IRI |
| `Catastrophe` | `ins:Catastrophe` | `res:catastrophe/{Catastrophe_Identifier}` | |
| `Claim` | `ins:Claim` | `res:claim/{Claim_Identifier}` | |
| `Claim_Coverage` | (관계) `ins:claimCoveredBy` | 주어 `res:claim/{Claim_Identifier}` → 목적어 `res:coverage-detail/{PCD_Identifier}/{Effective_Date}` | 연결 테이블 |
| `Claim_Amount` | `ins:ClaimAmount` | `res:claim-amount/{Claim_Amount_Identifier}` | |
| `Loss_Payment` | `ins:LossPayment` (타입만 추가) | `res:claim-amount/{Claim_Amount_Identifier}` | |
| `Expense_Payment` | `ins:ExpensePayment` | 동일 | |
| `Loss_Reserve` | `ins:LossReserve` | 동일 | |
| `Expense_Reserve` | `ins:ExpenseReserve` | 동일 | |
| (FK 값만 존재) | `ins:Party` | `res:party/{Party_Identifier}` | APR에서 생성 |
| (FK 값만 존재) | `ins:InsurableObject` | `res:insurable-object/{id}` | PCD·Claim·Policy_Amount에서 생성 |
| (FK 값만 존재) | `ins:Occurrence` | `res:occurrence/{id}` | Claim에서 생성 |
| (FK 값 NULL) | `ins:Coverage`, `ins:CoveragePart`, `ins:GeographicLocation`, `ins:ClaimOffer` | `res:coverage/{id}` 등 | 현재 생성되는 인스턴스 0개 |

중간 클래스(`ClaimPayment`, `ClaimReserve`, `LossAmount`, `ExpenseAmount`)는 매핑하지 않음. 리프 타입에서 `rdfs:subClassOf`로 추론됨.

### 7-3. 컬럼 → 속성 (전체 컬럼)

"데이터"는 현재 DB에서 값이 있는 행 수/전체 행 수.

| 테이블.컬럼 | 속성 | 변환 | 데이터 |
|---|---|---|---|
| Policy.Policy_Identifier | (주어 IRI) | INTEGER | 2/2 |
| Policy.Effective_Date | `ins:effectiveDate` | xsd:date | 2/2 |
| Policy.Expiration_Date | `ins:expirationDate` | xsd:date | 2/2 |
| Policy.Policy_Number | `ins:policyNumber` | 정수→문자열 | 2/2 |
| Policy.Status_Code | `ins:statusCode` | string | 0/2 |
| Policy.Geographic_Location_Identifier | `ins:policyLocatedIn` | IRI | 0/2 |
| Agreement_Party_Role.Agreement_Identifier | `ins:roleInAgreement` → `res:agreement/{}` | IRI | 4/4 |
| Agreement_Party_Role.Party_Identifier | `ins:rolePlayedBy` → `res:party/{}` | IRI | 4/4 |
| Agreement_Party_Role.Party_Role_Code | `ins:roleType` → 코드표 7-4 | 코드 | 4/4 |
| Agreement_Party_Role.Effective_Date | `ins:effectiveDate` | xsd:date | 0/4 |
| Agreement_Party_Role.Expiration_Date | `ins:expirationDate` | xsd:date | 0/4 |
| (파생) APR where code='PH' | `res:agreement/{A}` `ins:hasPolicyholder` `res:party/{P}` | | 2 |
| (파생) APR where code='AG' | `res:agreement/{A}` `ins:hasAgent` `res:party/{P}` | | 2 |
| Policy_Coverage_Detail.Effective_Date | (IRI 일부) + `ins:effectiveDate` | xsd:date | 6/6 |
| Policy_Coverage_Detail.Policy_Coverage_Detail_Identifier | (IRI 일부) | INTEGER | 6/6 |
| Policy_Coverage_Detail.Policy_Identifier | `ins:coverageDetailOf` → `res:agreement/{}` | IRI | 6/6 |
| Policy_Coverage_Detail.Insurable_Object_Identifier | `ins:coversObject` | IRI | 6/6 |
| Policy_Coverage_Detail.Coverage_Identifier | `ins:forCoverage` | IRI | 0/6 |
| Policy_Coverage_Detail.Coverage_Part_Code | `ins:inCoveragePart` → `res:coverage-part/{Policy_Identifier}/{code}` | IRI | 0/6 |
| Policy_Coverage_Detail.Coverage_Description | `ins:coverageDescription` | string | 0/6 |
| Policy_Coverage_Detail.Expiration_Date | `ins:expirationDate` | xsd:date | 6/6 |
| Policy_Coverage_Detail.Coverage_Inclusion_Exclusion_Code | `ins:inclusionExclusionCode` | string | 0/6 |
| Policy_Amount.Policy_Amount_Identifier | (주어 IRI) | INTEGER | 12/12 |
| Policy_Amount.Policy_Identifier | `ins:amountOfPolicy` | IRI | 12/12 |
| Policy_Amount.(Effective_Date, PCD_Identifier) | `ins:amountForCoverageDetail` | IRI | 12/12 |
| Policy_Amount.Effective_Date | `ins:effectiveDate` | xsd:date | 12/12 |
| Policy_Amount.Amount_Type_Code | `ins:amountType` → 코드표 7-4 | 코드 | 6/12 |
| Policy_Amount.Policy_Amount | `ins:amount` | xsd:decimal | 12/12 |
| Policy_Amount.Earning_Begin_Date / Earning_End_Date | `ins:earningBeginDate` / `ins:earningEndDate` | xsd:date | 0/12 |
| Policy_Amount.Insurable_Object_Identifier | `ins:amountForObject` | IRI | 0/12 |
| Policy_Amount.Geographic_Location_Identifier | `ins:amountInLocation` | IRI | 0/12 |
| Policy_Amount.Insurance_Type_Code | `ins:insuranceTypeCode` | string | 0/12 |
| Premium.Policy_Amount_Identifier | `rdf:type ins:Premium` | | 6/6 |
| Catastrophe.Catastrophe_Identifier | (주어 IRI) | INTEGER | 4/4 |
| Catastrophe.Catastrophe_Name | `ins:catastropheName` (+ `rdfs:label`) | string | 4/4 |
| Catastrophe.Catastrophe_Type_Code | `ins:catastropheTypeCode` | string | 0/4 |
| Catastrophe.Industry_Catastrophe_Code | `ins:industryCatastropheCode` | string | 0/4 |
| Catastrophe.Company_Catastrophe_Code | `ins:companyCatastropheCode` | string | 0/4 |
| Claim.Claim_Identifier | (주어 IRI) | INTEGER | 2/2 |
| Claim.Catastrophe_Identifier | `ins:claimFromCatastrophe` | IRI | 2/2 |
| Claim.Company_Claim_Number | `ins:claimNumber` | 정수→문자열 | 2/2 |
| Claim.Company_Subclaim_Number | `ins:subclaimNumber` | string | 0/2 |
| Claim.Insurable_Object_Identifier | `ins:claimOnObject` | IRI | 2/2 |
| Claim.Occurrence_Identifier | `ins:claimForOccurrence` | IRI | 2/2 |
| Claim.Claim_Open_Date | `ins:claimOpenDate` | xsd:date | 2/2 |
| Claim.Claim_Close_Date | `ins:claimCloseDate` | xsd:date | 2/2 |
| Claim.Claim_Reopen_Date | `ins:claimReopenDate` | xsd:date | 0/2 |
| Claim.Claim_Reported_Date | `ins:claimReportedDate` | xsd:date | 0/2 |
| Claim.Claims_Made_Date | `ins:claimsMadeDate` | xsd:date | 0/2 |
| Claim.Entry_Into_Claims_Made_Program_Date | `ins:claimsMadeProgramEntryDate` | xsd:date | 0/2 |
| Claim.Claim_Status_Code | `ins:claimStatusCode` | string | 0/2 |
| Claim.Claim_Description | `ins:claimDescription` | string | 0/2 |
| Claim_Coverage.* | `ins:claimCoveredBy` | IRI | 2/2 |
| Claim_Amount.Claim_Amount_Identifier | (주어 IRI) | INTEGER | 8/8 |
| Claim_Amount.Claim_Identifier | `ins:amountOfClaim` | IRI | 8/8 |
| Claim_Amount.Claim_Amount | `ins:amount` | xsd:decimal | 8/8 |
| Claim_Amount.Claim_Offer_Identifier | `ins:amountForOffer` | IRI | 0/8 |
| Claim_Amount.Amount_Type_Code | `ins:claimAmountTypeCode` | string | 0/8 |
| Claim_Amount.Event_Date | `ins:eventDate` | xsd:date | 0/8 |
| Claim_Amount.Insurance_Type_Code | `ins:insuranceTypeCode` | string | 0/8 |
| Loss_/Expense_ Payment/Reserve.Claim_Amount_Identifier | `rdf:type` 리프 클래스 | | 각 2/2 |

### 7-4. 코드값 (DB 직접 조회 결과)

조회 쿼리: `SELECT <컬럼>, quote(<컬럼>), COUNT(*) FROM <테이블> GROUP BY 1`

| 컬럼 | DB에 있는 값 (건수) | 매핑 | 의미 근거 |
|---|---|---|---|
| `Agreement_Party_Role.Party_Role_Code` | `'PH'` (2), `'AG'` (2) | `code:PH`, `code:AG` | 코드 테이블 `Party_Role`이 없음. 의미(계약자/대리인)는 업계 약어로 본 **[추정]**. 두 증권 모두 Party 1=PH, Party 2=AG |
| `Policy_Amount.Amount_Type_Code` | `'Year'` (6), NULL (6) | `code:Year` / 트리플 없음 | `'Year'` 6건이 정확히 `Premium` 6건과 일치(C4), 해당 담보기간 364~365일(C15) → "연간 보험료" |
| `Catastrophe.Catastrophe_Name` (코드 아님, 이름) | `Hurricane`, `Tornado`, `Flood`, `Fire` (각 1) | 문자열 리터럴 | 유형 코드 컬럼은 전부 NULL이라 이름을 레이블로 씀. 클레임 2건 모두 `Fire` |
| `Claim.Claim_Status_Code` | NULL (2) | – | 값 없음. 종결일이 있으므로 두 클레임 모두 실질적으로 종결 |
| `Policy.Status_Code` | NULL (2) | – | 값 없음 |
| `Claim_Amount.Amount_Type_Code` | NULL (8) | – | 값 없음. 금액 유형은 서브타입 테이블로만 구분됨 |
| `Claim_Amount.Insurance_Type_Code`, `Policy_Amount.Insurance_Type_Code` | NULL (전부) | – | 값 없음 |
| `Policy_Coverage_Detail.Coverage_Part_Code`, `Coverage_Inclusion_Exclusion_Code` | NULL (전부) | – | 값 없음 |
| `Catastrophe.Catastrophe_Type_Code`, `Industry_/Company_Catastrophe_Code` | NULL (전부) | – | 값 없음 |

### 7-5. 매핑 예시 (클레임 1건의 결과 트리플)

```turtle
res:claim/1 a ins:Claim ;
    ins:claimNumber "12312701" ;
    ins:claimFromCatastrophe res:catastrophe/4 ;
    ins:claimOnObject res:insurable-object/1 ;
    ins:claimForOccurrence res:occurrence/1 ;
    ins:claimOpenDate "2019-01-15"^^xsd:date ;
    ins:claimCloseDate "2019-01-31"^^xsd:date ;
    ins:claimCoveredBy <https://example.org/acme/resource/coverage-detail/5/2019-01-01> .
res:claim-amount/3 a ins:LossPayment ;               # ⇒ 추론: ClaimPayment, LossAmount, ClaimAmount
    ins:amountOfClaim res:claim/1 ; ins:amount "1200.00"^^xsd:decimal .
# 추론: res:claim/1 ins:claimUnderPolicy res:agreement/1 (속성 체인)
```

---

## 검증 ― ①의 질문을 SQL로 직접 답하기

모든 쿼리는 `sqlite3 data/acme.db`에서 실행했고, 아래 결과는 실제 출력 그대로임. 각 쿼리는 ⑦ 매핑의 경로를 그대로 따라감(온톨로지 경로 → 조인).

### CQ1. 증권별 계약자와 대리인

경로: `Policy ← roleInAgreement ― AgreementPartyRole ― rolePlayedBy → Party`, `roleType ∈ {PH, AG}`

```sql
SELECT CAST(p.Policy_Number AS INTEGER) AS policy_number,
       CASE apr.Party_Role_Code WHEN 'PH' THEN 'Policyholder' WHEN 'AG' THEN 'Agent' END AS role,
       CAST(apr.Party_Identifier AS INTEGER) AS party_id
FROM Policy p JOIN Agreement_Party_Role apr ON apr.Agreement_Identifier = p.Policy_Identifier
ORDER BY 1, 2 DESC;
```

| policy_number | role | party_id |
|---|---|---|
| 31003000336 | Policyholder | 1 |
| 31003000336 | Agent | 2 |
| 31003000337 | Policyholder | 1 |
| 31003000337 | Agent | 2 |

→ 답: 두 증권 모두 계약자는 Party 1, 대리인은 Party 2. `Party` 테이블이 없어서 이름은 알 수 없음.

### CQ2. 증권·담보기간별 연간 보험료

경로: `Policy → hasCoverageDetail → PCD ← amountForCoverageDetail ― PolicyAmount`, `Premium`이면 보험료

```sql
SELECT CAST(p.Policy_Number AS INTEGER) AS policy_number, pcd.Effective_Date AS cov_from, pcd.Expiration_Date AS cov_to,
       SUM(CASE WHEN pr.Policy_Amount_Identifier IS NOT NULL THEN pa.Policy_Amount END) AS premium,
       SUM(CASE WHEN pr.Policy_Amount_Identifier IS NULL THEN pa.Policy_Amount END) AS other_amount
FROM Policy_Coverage_Detail pcd
JOIN Policy p ON p.Policy_Identifier = pcd.Policy_Identifier
JOIN Policy_Amount pa ON pa.Effective_Date = pcd.Effective_Date
                     AND pa.Policy_Coverage_Detail_Identifier = pcd.Policy_Coverage_Detail_Identifier
LEFT JOIN Premium pr ON pr.Policy_Amount_Identifier = pa.Policy_Amount_Identifier
GROUP BY 1,2,3 ORDER BY 1,2;
```

| policy_number | cov_from | cov_to | premium | other_amount |
|---|---|---|---|---|
| 31003000336 | 2015-01-01 | 2015-12-31 | 15000.0 | 1000000.0 |
| 31003000336 | 2016-01-01 | 2016-12-31 | 16000.0 | 1000000.0 |
| 31003000336 | 2017-01-01 | 2017-12-31 | 17000.0 | 1000000.0 |
| 31003000336 | 2018-01-01 | 2018-12-31 | 18000.0 | 1000000.0 |
| 31003000336 | 2019-01-01 | 2019-12-31 | 20000.0 | 1000000.0 |
| 31003000337 | 2019-06-01 | 2020-05-31 | 12000.0 | 600000.0 |

→ 답: 증권 …336은 5년 동안 매년 갱신됐고 보험료는 15,000에서 20,000으로 올랐음. 증권 …337은 연 12,000. `other_amount`는 ④-3에서 말한 대로 한도로 보이지만 확인되지 않은 값이라 보험료와 섞지 않았음. 이렇게 나눌 수 있는 것은 `Premium ⊑ PolicyAmount` 계층 덕분.

### CQ3. 클레임별 재해, 담보 증권·기간, 처리 일수

경로: `Claim → claimFromCatastrophe → Catastrophe`, `Claim → claimCoveredBy → PCD → coverageDetailOf → Policy` (= `claimUnderPolicy`)

```sql
SELECT CAST(c.Company_Claim_Number AS INTEGER) AS claim_number, cat.Catastrophe_Name AS catastrophe,
       CAST(p.Policy_Number AS INTEGER) AS policy_number, pcd.Effective_Date AS cov_from, pcd.Expiration_Date AS cov_to,
       c.Claim_Open_Date AS opened, c.Claim_Close_Date AS closed,
       CAST(julianday(c.Claim_Close_Date) - julianday(c.Claim_Open_Date) AS INTEGER) AS days_open
FROM Claim c
LEFT JOIN Catastrophe cat ON cat.Catastrophe_Identifier = c.Catastrophe_Identifier
JOIN Claim_Coverage cc ON cc.Claim_Identifier = c.Claim_Identifier
JOIN Policy_Coverage_Detail pcd ON pcd.Effective_Date = cc.Effective_Date
                               AND pcd.Policy_Coverage_Detail_Identifier = cc.Policy_Coverage_Detail_Identifier
JOIN Policy p ON p.Policy_Identifier = pcd.Policy_Identifier
ORDER BY 1;
```

| claim_number | catastrophe | policy_number | cov_from | cov_to | opened | closed | days_open |
|---|---|---|---|---|---|---|---|
| 12312701 | Fire | 31003000336 | 2019-01-01 | 2019-12-31 | 2019-01-15 | 2019-01-31 | 16 |
| 12312702 | Fire | 31003000336 | 2019-01-01 | 2019-12-31 | 2019-06-02 | 2019-06-27 | 25 |

→ 답: 두 건 모두 화재(Fire)로 발생했고, 증권 …336의 2019년 담보기간으로 처리됐으며, 처리 기간은 16일과 25일.
⚠ 제약 S7 위반(아래 C8): 클레임 12312702의 목적물은 **2번**인데, 연결된 담보상세(PCD 5)는 **1번** 목적물을 담보함. 같은 날(2019-06-02) 2번 목적물을 담보하는 것은 증권 …337의 PCD 6임. DB의 연결이 잘못됐을 가능성이 있음. DB는 고치지 않았고, 원천 확인이 필요함.

### CQ4. 클레임별 손해/비용 × 지급/준비금

경로: `Claim ← amountOfClaim ― ClaimAmount`, 리프 클래스로 2×2 분리

```sql
SELECT CAST(c.Company_Claim_Number AS INTEGER) AS claim_number,
  SUM(CASE WHEN lr.Claim_Amount_Identifier IS NOT NULL THEN ca.Claim_Amount END) AS loss_reserve,
  SUM(CASE WHEN er.Claim_Amount_Identifier IS NOT NULL THEN ca.Claim_Amount END) AS expense_reserve,
  SUM(CASE WHEN lp.Claim_Amount_Identifier IS NOT NULL THEN ca.Claim_Amount END) AS loss_payment,
  SUM(CASE WHEN ep.Claim_Amount_Identifier IS NOT NULL THEN ca.Claim_Amount END) AS expense_payment,
  SUM(CASE WHEN lp.Claim_Amount_Identifier IS NOT NULL
             OR ep.Claim_Amount_Identifier IS NOT NULL THEN ca.Claim_Amount END) AS total_paid
FROM Claim c JOIN Claim_Amount ca ON ca.Claim_Identifier = c.Claim_Identifier
LEFT JOIN Loss_Reserve    lr ON lr.Claim_Amount_Identifier = ca.Claim_Amount_Identifier
LEFT JOIN Expense_Reserve er ON er.Claim_Amount_Identifier = ca.Claim_Amount_Identifier
LEFT JOIN Loss_Payment    lp ON lp.Claim_Amount_Identifier = ca.Claim_Amount_Identifier
LEFT JOIN Expense_Payment ep ON ep.Claim_Amount_Identifier = ca.Claim_Amount_Identifier
GROUP BY 1 ORDER BY 1;
```

| claim_number | loss_reserve | expense_reserve | loss_payment | expense_payment | total_paid |
|---|---|---|---|---|---|
| 12312701 | 1000.0 | 1100.0 | 1200.0 | 1300.0 | 2500.0 |
| 12312702 | 2100.0 | 2200.0 | 2300.0 | 2400.0 | 4700.0 |

→ 답: 위 표와 같음. `total_paid`는 축 A의 `ClaimPayment`(LossPayment + ExpensePayment)에 해당함. SQL에서는 테이블 두 개를 OR로 묶어야 하지만, 온톨로지에서는 `?x a ins:ClaimPayment` 한 줄이면 됨. 2축 계층을 만든 이유가 여기서 드러남.

### CQ5. 증권·담보기간별 손해율

경로: CQ2의 `Premium` + CQ3의 `claimCoveredBy` + CQ4의 `LossPayment`

```sql
WITH prem AS (
  SELECT pa.Effective_Date AS eff, pa.Policy_Coverage_Detail_Identifier AS pcd_id, SUM(pa.Policy_Amount) AS premium
  FROM Policy_Amount pa JOIN Premium pr ON pr.Policy_Amount_Identifier = pa.Policy_Amount_Identifier GROUP BY 1,2),
loss AS (
  SELECT cc.Effective_Date AS eff, cc.Policy_Coverage_Detail_Identifier AS pcd_id, SUM(ca.Claim_Amount) AS paid_loss
  FROM Claim_Coverage cc JOIN Claim_Amount ca ON ca.Claim_Identifier = cc.Claim_Identifier
  JOIN Loss_Payment lp ON lp.Claim_Amount_Identifier = ca.Claim_Amount_Identifier GROUP BY 1,2)
SELECT CAST(p.Policy_Number AS INTEGER) AS policy_number, pcd.Effective_Date AS cov_from,
       prem.premium, COALESCE(loss.paid_loss,0) AS paid_loss,
       ROUND(100.0*COALESCE(loss.paid_loss,0)/prem.premium,1) AS loss_ratio_pct
FROM Policy_Coverage_Detail pcd
JOIN Policy p ON p.Policy_Identifier = pcd.Policy_Identifier
JOIN prem ON prem.eff = pcd.Effective_Date AND prem.pcd_id = pcd.Policy_Coverage_Detail_Identifier
LEFT JOIN loss ON loss.eff = pcd.Effective_Date AND loss.pcd_id = pcd.Policy_Coverage_Detail_Identifier
ORDER BY 1,2;
```

| policy_number | cov_from | premium | paid_loss | loss_ratio_pct |
|---|---|---|---|---|
| 31003000336 | 2015-01-01 | 15000.0 | 0 | 0.0 |
| 31003000336 | 2016-01-01 | 16000.0 | 0 | 0.0 |
| 31003000336 | 2017-01-01 | 17000.0 | 0 | 0.0 |
| 31003000336 | 2018-01-01 | 18000.0 | 0 | 0.0 |
| 31003000336 | 2019-01-01 | 20000.0 | 3500.0 | 17.5 |
| 31003000337 | 2019-06-01 | 12000.0 | 0 | 0.0 |

→ 답: DB에 기록된 연결대로 계산하면 손해가 난 기간은 증권 …336의 2019년 하나뿐이고, 손해율은 **17.5%**(3,500 ÷ 20,000).
⚠ CQ3의 S7 위반을 바로잡아 클레임 12312702를 PCD 6에 연결하면 결과가 달라짐: …336의 2019년은 6.0%(1,200 ÷ 20,000), …337은 19.2%(2,300 ÷ 12,000). 어느 쪽이 맞는지는 원천 시스템 확인이 필요함.

### 제약 검증 (⑥에 대응)

모든 쿼리는 위반 건수를 셈(0이면 통과).

| ID | 검사 | 결과 |
|---|---|---|
| C1 | ClaimAmount 각 행이 리프 서브타입 정확히 1개에 속함 (S1) | 0 ✅ |
| C2 | 클레임 서브타입 행에 상위 행이 있음 (S2) | 0 ✅ |
| C3 | Premium 행에 상위 Policy_Amount 행이 있음 (S2) | 0 ✅ |
| C4 | `Amount_Type_Code='Year'` ⇔ Premium (S3) | 0 ✅ |
| C5 | 종결일 ≥ 개시일 (S4) | 0 ✅ |
| C6 | 담보기간 ⊂ 증권기간 (S5) | 0 ✅ |
| C7 | 클레임 개시일이 연결된 담보기간 안에 있음 (S6) | 0 ✅ |
| C8 | 클레임 목적물 = 담보상세 목적물 (S7) | **1 ❌** 클레임 12312702: 목적물 2 vs PCD 5의 목적물 1 (같은 날 목적물 2를 담보하는 것은 PCD 6) |
| C9 | Policy_Amount의 증권 = 그 PCD의 증권 (S8) | 0 ✅ |
| C10 | 금액 ≥ 0 (S9) | 0 ✅ |
| C11 | 역할 코드 ∈ {PH, AG} (S10) | 0 ✅ |
| C12 | 증권마다 계약자 정확히 1명 (S11) | 0 ✅ |
| C13 | DDL NOT NULL 준수 | **❌** APR.Effective_Date 4/4, PCD.Coverage_Identifier 6/6, PCD.Coverage_Part_Code 6/6, Policy_Amount.Geographic_Location_Identifier 12/12가 NULL → 6-3에서 완화함 |
| C14 | 같은 증권·목적물의 담보기간이 겹치지 않음 (S12) | 0 ✅ |
| C15 | `Year` 보험료의 담보기간 길이 | 364~365일 ✅ |
| C16 | DDL FK 대상 테이블 11개 존재 여부 | 0/11 존재 (클래스는 선언, 인스턴스는 FK 값에서 생성) |
| C17 | PK 유일성 (Claim, PCD 복합키) | 중복 0 ✅ |
| C18 | 모든 클레임이 담보상세에 연결됨 (S13) | 0 ✅ |
| C19 | REAL로 저장된 ID·번호에 소수부가 없음 (⑦ INTEGER 변환이 안전한지) | 0 ✅ |

### 결론

- 다섯 질문 모두 이 온톨로지의 클래스·관계 경로만 따라가서 SQL로 답할 수 있었음. 따라서 범위는 충분함.
- 2축 클레임금액 계층(CQ4), `Premium ⊑ PolicyAmount`(CQ2), 속성 체인 `claimUnderPolicy`(CQ3·CQ5)가 실제 질의를 단순하게 만들었음.
- 데이터 쪽 확인이 필요한 항목은 두 가지:
  1. 클레임 12312702의 담보 연결(C8). CQ3·CQ5의 답이 이 연결에 따라 달라짐.
  2. DDL NOT NULL 위반 4개 컬럼과 없는 참조 테이블 11개(C13, C16).
- **[추정]** 으로 남긴 의미 3가지(`PH`=계약자, `AG`=대리인, 비보험료 계약금액=한도)는 코드 테이블이나 업무 문서로 확인해야 함.
