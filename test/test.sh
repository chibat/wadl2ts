#!/bin/bash

rm -f ../test/client.ts
# ../bin/wadl2ts ../test/client.ts client ../test/application.wadl
../bin/wadl2ts ../test/client.ts client http://localhost:8080/wadl2ts-example/rest/application.wadl



