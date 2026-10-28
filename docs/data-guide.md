# 보험 데이터 설명서

`data/ontology.ttl`(개념 정의)과 `data/mapping.r2rml`(개념 ↔ 테이블 연결)을 사람이 읽기 쉽게 옮긴 문서입니다.
데이터는 `data/acme.db`(SQLite)에 있고, `data/csv/*.csv` 13개를 `scripts/build-db.mjs`로 그대로 옮겨 만든 것입니다.

- 온톨로지 이름: **Insurance Ontology** — 손해보험(Property & Casualty) 분야의 업무 개념·속성·관계를 정의하며, OMG Property and Casualty Data Model을 바탕으로 합니다.
- 개념(클래스) 11개, 개념 사이 관계 10개, 값 속성 19개.
- 매핑의 SQL은 칸 이름을 소문자로 쓰지만(`claim_identifier`), 실제 DB의 칸 이름은 `Claim_Identifier`처럼 대문자로 시작합니다. SQLite는 칸·테이블 이름의 대소문자를 구분하지 않으므로 어느 쪽으로 써도 됩니다.

---

## 1. 한눈에 보기

```
               soldByAgent                hasPolicyHolder
   Agent  <──────────────────  Policy  ──────────────────>  PolicyHolder
 (Agreement_Party_Role,         (Policy)                  (Agreement_Party_Role,
  역할 'AG')                       ^                          역할 'PH')
                                   │ hasPolicy
                                   │
                         PolicyCoverageDetail ──hasPremiumAmount──> Premium
                       (Policy_Coverage_Detail)                  (Policy_Amount + Premium)
                                   ^
                                   │ against
                                   │ (Claim_Coverage)
   Catastrophe  <──hasCatastrophe── Claim
   (Catastrophe)                   (Claim)
                                   │
          ┌──────────────┬─────────┴────┬────────────────┐
   hasLossPayment  hasLossReserve  hasExpensePayment  hasExpenseReserve
          v              v              v                v
     LossPayment    LossReserve   ExpensePayment   ExpenseReserve
   (Claim_Amount + 하위 테이블 Loss_Payment / Loss_Reserve / Expense_Payment / Expense_Reserve)
```

화살표는 온톨로지의 관계 방향(주어 → 목적어)입니다.

---

## 2. 개념별 설명

### 2.1 Policy (보험 증권)

보험 회사와 고객이 맺은 보험 계약 한 건입니다. 계약 기간(시작일~만료일)과 증권 번호를 가집니다.

- **저장 위치**: `Policy` 테이블, 한 행 = 증권 하나
- **식별자**: `Policy_Identifier`

| 속성 | 뜻 | 칸 |
|---|---|---|
| `policyNumber` (Policy Number) | 고객에게 보이는 증권 번호 | `Policy.Policy_Number` |
| `policyEffectiveDate` (Policy Effective Date) | 증권 효력 시작일 | `Policy.Effective_Date` |
| `policyExpirationDate` (Policy Expiration Date) | 증권 만료일 | `Policy.Expiration_Date` |

관계:
- `hasPolicyHolder` → PolicyHolder (계약자) — 2.2 참고
- `soldByAgent` → Agent (판매 설계사) — 2.3 참고
- PolicyCoverageDetail이 `hasPolicy`로 이 증권을 가리킵니다 — 2.4 참고

### 2.2 PolicyHolder (계약자)

증권을 소유한 당사자(사람 또는 회사)입니다. 별도 테이블이 없고, **계약–당사자 역할 테이블에서 역할 코드가 `PH`인 당사자**가 계약자입니다.

- **저장 위치**: `Agreement_Party_Role` 테이블 중 `Party_Role_Code = 'PH'`인 행
- **식별자**: `Party_Identifier`
- 매핑은 `Policy`와 조인되는(`Agreement_Identifier = Policy.Policy_Identifier`) 당사자만 계약자로 셉니다. 같은 사람이 여러 증권의 계약자일 수 있으므로 계약자 목록은 `DISTINCT Party_Identifier`로 뽑습니다.

| 속성 | 뜻 | 칸 |
|---|---|---|
| `policyHolderId` (Policy Holder ID) | 계약자 ID | `Agreement_Party_Role.Party_Identifier` |

관계 `hasPolicyHolder` (Policy → PolicyHolder):

```sql
SELECT p.Policy_Identifier, apr.Party_Identifier
FROM Agreement_Party_Role apr
JOIN Policy p ON apr.Agreement_Identifier = p.Policy_Identifier
WHERE apr.Party_Role_Code = 'PH';
```

### 2.3 Agent (보험 설계사)

증권을 판매한 설계사(대리점)입니다. 계약자와 같은 테이블에 있고 **역할 코드가 `AG`**인 것만 다릅니다.

- **저장 위치**: `Agreement_Party_Role` 테이블 중 `Party_Role_Code = 'AG'`인 행
- **식별자**: `Party_Identifier`

| 속성 | 뜻 | 칸 |
|---|---|---|
| `agentId` (Agent ID) | 설계사 ID | `Agreement_Party_Role.Party_Identifier` |

관계 `soldByAgent` (Policy → Agent): 2.2의 SQL에서 `'PH'`를 `'AG'`로 바꾼 것과 같습니다.

### 2.4 PolicyCoverageDetail (증권 보장 내역)

증권 아래에서 특정 기간 동안 적용되는 보장 한 건입니다. 한 증권은 여러 보장 내역을 가질 수 있습니다(예: 해마다 갱신되는 보장 기간마다 한 건).

- **저장 위치**: `Policy_Coverage_Detail` 테이블, 한 행 = 보장 내역 하나
- **식별자**: `Policy_Coverage_Detail_Identifier` (테이블의 기본 키는 `Effective_Date` + `Policy_Coverage_Detail_Identifier` 조합)

| 속성 | 뜻 | 칸 |
|---|---|---|
| `policyCoverageEffectiveDate` (Policy Coverage Effective Date) | 보장 시작일 | `Policy_Coverage_Detail.Effective_Date` |
| `policyCoverageExpirationDate` (Policy Coverage Expiration Date) | 보장 만료일 | `Policy_Coverage_Detail.Expiration_Date` |

관계:
- `hasPolicy` → Policy: `Policy_Coverage_Detail.Policy_Identifier = Policy.Policy_Identifier`
- `hasPremiumAmount` → Premium: `Policy_Amount.Policy_Coverage_Detail_Identifier` 로 연결 (2.5 참고)
- Claim이 `against`로 이 보장 내역을 가리킵니다 (2.6 참고)

### 2.5 Premium (보험료)

보장 내역에 대해 청구되는 보험료 금액입니다. 증권 관련 금액은 모두 `Policy_Amount`에 들어 있고, 그중 **`Premium` 테이블에 ID가 올라 있는 행만** 보험료입니다.

- **저장 위치**: `Policy_Amount` 테이블 ⨝ `Premium` 테이블 (`Policy_Amount_Identifier`로 조인)
- **식별자**: `Policy_Amount_Identifier`

| 속성 | 뜻 | 칸 |
|---|---|---|
| `premiumAmount` (Premium Amount) | 보험료 금액 | `Policy_Amount.Policy_Amount` |
| `premiumPeriod` (Premium Period) | 보험료 기간 단위 | `Policy_Amount.Amount_Type_Code` (코드값 `Year` = 연간) |
| `premiumAmountMonthly` (Premium Amount Monthly) | 월 환산 보험료 — DB 칸이 아니라 계산값 | `Amount_Type_Code = 'Year'`일 때 `Policy_Amount / 12`, 그 밖에는 값 없음(NULL) |

관계 `hasPremiumAmount` (PolicyCoverageDetail → Premium):

```sql
SELECT pa.Policy_Coverage_Detail_Identifier, pa.Policy_Amount_Identifier,
       pa.Policy_Amount, pa.Amount_Type_Code,
       CASE WHEN pa.Amount_Type_Code = 'Year' THEN pa.Policy_Amount / 12.0 END AS monthly_premium
FROM Policy_Amount pa
JOIN Premium pr ON pa.Policy_Amount_Identifier = pr.Policy_Amount_Identifier;
```

주의:
- `Premium`에 없는 `Policy_Amount` 행은 보험료가 **아닙니다**. 매핑은 이 행들을 온톨로지 밖의 별도 개념 `PolicyAmount`(증권 금액, 예: 보장 한도)로 다룹니다(5장 참고). 보험료 합계를 낼 때 `Policy_Amount` 전체를 더하면 안 됩니다.
- 매핑 원문은 `policy_amount/12`로 나눕니다. SQLite에서는 정수끼리 나누면 소수점이 버려지므로 월 보험료를 정확히 구하려면 `/ 12.0`을 쓰세요.

### 2.6 Claim (보험금 청구)

보험 사고로 고객이 보험금을 청구한 한 건입니다.

- **저장 위치**: `Claim` 테이블, 한 행 = 청구 하나
- **식별자**: `Claim_Identifier`

| 속성 | 뜻 | 칸 |
|---|---|---|
| `claimNumber` (Claim Number) | 회사가 붙인 청구 번호 | `Claim.Company_Claim_Number` |
| `claimOpenDate` (Claim Open Date) | 청구 접수(개시)일 | `Claim.Claim_Open_Date` |
| `claimCloseDate` (Claim Close Date) | 청구 종결일 | `Claim.Claim_Close_Date` |

관계:

| 관계 | 대상 | 연결 방법 |
|---|---|---|
| `against` | PolicyCoverageDetail (청구가 걸린 보장 내역) | `Claim_Coverage` 테이블: `Claim_Identifier` ↔ `Policy_Coverage_Detail_Identifier` |
| `hasCatastrophe` | Catastrophe (원인 재해) | `Claim.Catastrophe_Identifier = Catastrophe.Catastrophe_Identifier` |
| `hasLossPayment` | LossPayment | 2.8 참고 |
| `hasLossReserve` | LossReserve | 2.8 참고 |
| `hasExpensePayment` | ExpensePayment | 2.8 참고 |
| `hasExpenseReserve` | ExpenseReserve | 2.8 참고 |

청구에서 증권까지 가는 길: `Claim` → `Claim_Coverage` → `Policy_Coverage_Detail` → `Policy`.
계약자·설계사까지 가려면 여기서 `Agreement_Party_Role`(역할 `PH`/`AG`)을 한 번 더 조인합니다.

```sql
SELECT c.Claim_Identifier, p.Policy_Identifier, p.Policy_Number
FROM Claim c
JOIN Claim_Coverage cc ON cc.Claim_Identifier = c.Claim_Identifier
JOIN Policy_Coverage_Detail pcd ON pcd.Policy_Coverage_Detail_Identifier = cc.Policy_Coverage_Detail_Identifier
JOIN Policy p ON p.Policy_Identifier = pcd.Policy_Identifier;
```

### 2.7 Catastrophe (재해)

여러 청구를 한꺼번에 일으킬 수 있는 큰 재해(태풍, 화재 등)입니다.

- **저장 위치**: `Catastrophe` 테이블
- **식별자**: `Catastrophe_Identifier`

| 속성 | 뜻 | 칸 |
|---|---|---|
| `catastropheName` (Catastrophe Name) | 재해 이름 (예: `Hurricane`, `Tornado`, `Flood`, `Fire`) | `Catastrophe.Catastrophe_Name` |

### 2.8 청구 금액 네 가지: LossPayment · LossReserve · ExpensePayment · ExpenseReserve

청구와 관련된 금액은 모두 `Claim_Amount` 테이블 한 곳에 있습니다. **그 금액이 어떤 종류인지는 코드 칸이 아니라, 그 `Claim_Amount_Identifier`가 어느 하위 테이블에 들어 있는지로 정해집니다.**

| 개념 | 뜻 | 종류를 정하는 하위 테이블 | 금액 속성 → 칸 | 청구와의 관계 |
|---|---|---|---|---|
| **LossPayment** (손해 지급금) | 피해에 대해 실제로 지급한 보험금 | `Loss_Payment` | `lossPaymentAmount` → `Claim_Amount.Claim_Amount` | `hasLossPayment` |
| **LossReserve** (손해 준비금) | 앞으로 지급할 보험금으로 잡아 둔 추정액 | `Loss_Reserve` | `lossReserveAmount` → `Claim_Amount.Claim_Amount` | `hasLossReserve` |
| **ExpensePayment** (비용 지급금) | 청구 처리에 든 비용(조사·법률 비용 등)으로 지급한 돈 | `Expense_Payment` | `expensePaymentAmount` → `Claim_Amount.Claim_Amount` | `hasExpensePayment` |
| **ExpenseReserve** (비용 준비금) | 앞으로 들 처리 비용으로 잡아 둔 추정액 | `Expense_Reserve` | `expenseReserveAmount` → `Claim_Amount.Claim_Amount` | `hasExpenseReserve` |

- 네 하위 테이블은 모두 `Claim_Amount_Identifier` 칸 하나만 가집니다.
- 어느 청구의 금액인지는 `Claim_Amount.Claim_Identifier`로 압니다.
- `Claim_Amount.Amount_Type_Code`는 이 구분에 쓰이지 않습니다(이 DB에서는 비어 있음).

예: 청구별 손해 지급금 합계

```sql
SELECT ca.Claim_Identifier, SUM(ca.Claim_Amount) AS loss_payment_total
FROM Claim_Amount ca
JOIN Loss_Payment lp ON lp.Claim_Amount_Identifier = ca.Claim_Amount_Identifier
GROUP BY ca.Claim_Identifier;
```

`Loss_Payment` 자리에 `Loss_Reserve`, `Expense_Payment`, `Expense_Reserve`를 넣으면 나머지 세 가지가 됩니다. 하위 테이블 없이 `Claim_Amount`만 더하면 네 종류가 섞인 값이 나옵니다.

---

## 3. 관계 정리

| 관계 | 라벨 | 주어 → 목적어 | 테이블·조인 |
|---|---|---|---|
| `against` | against | Claim → PolicyCoverageDetail | `Claim_Coverage` (`Claim_Identifier`, `Policy_Coverage_Detail_Identifier`) |
| `hasCatastrophe` | has catastrophe | Claim → Catastrophe | `Claim.Catastrophe_Identifier` |
| `hasLossPayment` | has loss payment | Claim → LossPayment | `Claim_Amount` ⨝ `Loss_Payment` |
| `hasLossReserve` | has loss reserve | Claim → LossReserve | `Claim_Amount` ⨝ `Loss_Reserve` |
| `hasExpensePayment` | has expense payment | Claim → ExpensePayment | `Claim_Amount` ⨝ `Expense_Payment` |
| `hasExpenseReserve` | has expense reserve | Claim → ExpenseReserve | `Claim_Amount` ⨝ `Expense_Reserve` |
| `hasPolicy` | has policy | PolicyCoverageDetail → Policy | `Policy_Coverage_Detail.Policy_Identifier` |
| `hasPremiumAmount` | has premium amount | PolicyCoverageDetail → Premium | `Policy_Amount` ⨝ `Premium`, `Policy_Amount.Policy_Coverage_Detail_Identifier` |
| `hasPolicyHolder` | has policy holder | Policy → PolicyHolder | `Agreement_Party_Role` (`Party_Role_Code = 'PH'`) |
| `soldByAgent` | sold by agent | Policy → Agent | `Agreement_Party_Role` (`Party_Role_Code = 'AG'`) |

---

## 4. 코드값과 값 형식

| 테이블.칸 | 코드값 | 뜻 |
|---|---|---|
| `Agreement_Party_Role.Party_Role_Code` | `PH` | Policy Holder — 계약자 |
| | `AG` | Agent — 설계사 |
| `Policy_Amount.Amount_Type_Code` | `Year` | 연간 금액 (보험료 기간 단위) |
| | 비어 있음(NULL) | 기간 단위 없음 |
| `Agreement_Party_Role.Agreement_Identifier` | — | 계약 ID. 이 DB에서는 `Policy.Policy_Identifier`와 같은 값 |

값 형식:
- 날짜(`Effective_Date`, `Expiration_Date`, `Claim_Open_Date`, `Claim_Close_Date` 등)는 `'YYYY-MM-DD'` 문자열입니다. 온톨로지는 `xsd:dateTime`으로 정의하지만 DB에는 시간 부분이 없습니다. 기간 비교는 문자열 비교나 `date()` 함수로 하면 됩니다.
- DB를 만들 때 숫자처럼 보이는 값은 숫자로 넣었습니다. 그래서 `Policy.Policy_Number`, `Claim.Company_Claim_Number`도 문자열이 아니라 **숫자**로 저장되어 있습니다. 비교할 때 `Policy_Number = 31003000336`처럼 따옴표 없이 쓰세요.
- 금액(`Policy_Amount`, `Claim_Amount`)은 숫자이고 통화 단위는 따로 적혀 있지 않습니다.

---

## 5. 매핑에만 있고 이 DB에서는 쓸 수 없는 것

`mapping.r2rml`은 원래 더 큰 OMG P&C 데이터베이스를 위해 만들어져서, 온톨로지(`ontology.ttl`)에 정의되지 않은 개념과 이 DB에 없는 테이블도 가리킵니다. 참고로만 적어 둡니다.

| 매핑의 개념·속성 | 가리키는 원본 | 이 DB에서 |
|---|---|---|
| `PolicyAmount`, `policyAmount`, `hasPolicyAmount` | `Policy_Amount` 중 `Premium`에 **없는** 행 (보험료가 아닌 증권 금액) | 테이블은 있음. 온톨로지에는 정의 없음 |
| `hasPolicyCoverageDetail` (Policy → PolicyCoverageDetail) | `Policy_Coverage_Detail` | `hasPolicy`의 반대 방향 |
| `hasClaim` (PolicyCoverageDetail → Claim) | `Claim_Coverage` | `against`의 반대 방향 |
| `policyCoverageDetailId` | `Policy_Coverage_Detail.Policy_Coverage_Detail_Identifier` | 있음 |
| `InsurableObject`, `hasInsurableObject`, `involvesInsurableObject` | `insurable_object` 테이블 | 테이블 없음. `Claim`·`Policy_Coverage_Detail`의 `Insurable_Object_Identifier` 칸만 있음 |
| `Location`, `hasLocation`, `addressLine1`, `addressLine2`, `city`, `state`, `zipCode`, `country`, `latitude`, `longitud` | `geographic_location`, `location_address`, `physical_location` | 테이블 없음 |
| `Underwriter`, `underwriterId`, `hasUnderwriter` | `assesment_party_role` (역할 코드 `UW` = 언더라이터) | 테이블 없음 |
| `UnderwritingAssessment`, `underwritingBeginDate`, `underwritingEndDate`, `hasUnderwritingAssessment`, `underwritesPolicy` | `assessment`, `assessment_result`, `underwriting_assessment`, `agreement_assessment` | 테이블 없음 |

매핑 파일 자체의 어긋남(그래프로 변환할 때만 문제가 되고 SQL 질의에는 영향 없음):
- 계약자 개체 주소가 `Policy-Holder-{id}`(클래스 정의)와 `PolicyHolder-{id}`(`hasPolicyHolder` 관계)로 서로 다릅니다.
- 언더라이팅 심사 주소도 `Underwriting-Assessment-{id}`와 `UnderwritingAssessment-{id}`로 섞여 있습니다.
- 네 가지 청구 금액(2.8)은 매핑에서 모두 `ClaimAmount-{id}` 주소를 쓰고 클래스(LossPayment 등)를 붙이지 않습니다. 종류 구분은 오직 어느 하위 테이블과 조인했는지로만 드러납니다.
