# Excerpts from GitHub Actions runs (raw log lines, timestamps stripped)

## Run 39615537895 (first manual run): integration test, release, 'waitingCount stays 0' assertion
https://github.com/Mayank-Rawat-1708/poolside/actions/runs/39615537895
```
   ✓ transaction strategy under concurrency > hold: connections are pinned across the provider call and callers queue  1296ms
   × transaction strategy under concurrency > release: no caller ever waits for a connection 528ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected 6 to be +0 // Object.is equality
      Tests  1 failed | 1 passed (2)
##[error]AssertionError: expected 6 to be +0 // Object.is equality
```

## Run 39616649894: load test (slow-downstream, release) before classifying pg's second timeout message
https://github.com/Mayank-Rawat-1708/poolside/actions/runs/39616649894
```
   ✓ http_req_failed................: 0.44%  ✓ 4         ✗ 898 
     ✓ { status:200 }...............: 220    3.602901/s
     ✓ { status:201 }...............: 676    11.070731/s
     ✓ { status:500 }...............: 4      0.065507/s
     ✓ { status:503 }...............: 0      0/s
api-1  | {"level":50,"time":"2026-10-21T14:26:49.691Z","service":"api","requestId":"be88f869-c2fc-47f0-9a24-3ab069ae7356","err":{"type":"Error","message":"Connection terminated due to connection timeo
```

## Run 39617721171: load test after the fix (b1885a1)
https://github.com/Mayank-Rawat-1708/poolside/actions/runs/39617721171
```
     ✓ { endpoint:create_order }....: avg=1.21s    min=805.58ms med=1.21s   max=2.51s    p(90)=1.53s   p(95)=1.57s    p(99)=1.59s   
     ✓ { endpoint:get_order }.......: avg=1.54ms   min=737.72µs med=1.58ms  max=7.54ms   p(90)=1.85ms  p(95)=2.06ms   p(99)=4.22ms  
     ✓ { endpoint:health }..........: avg=1.35ms   min=617.57µs med=1.37ms  max=3.95ms   p(90)=1.63ms  p(95)=2.1ms    p(99)=3.75ms  
   ✓ http_req_failed................: 0.11%  ✓ 1         ✗ 902 
     http_reqs......................: 903    14.611401/s
     ✓ { status:200 }...............: 271    4.385038/s
     ✓ { status:201 }...............: 629    10.177819/s
     ✓ { status:500 }...............: 0      0/s
     ✓ { status:503 }...............: 1      0.016181/s
```
