
# wadl2ts

WADL から REST Client になる TypeScript のコードを生成するツール

## Usage

    wadl2ts DEST MODULE URL

* DEST: 生成する TypeScript のファイル名
* MODULE: 生成する TypeScript のモジュール名
* URL: wadl の URL または、wadl ファイルのパス

### example 

    wadl2ts client.ts client http://localhost:8080/wadl2ts-example/rest/application.wadl

## TODO

* TODO XSD と TS の型のマッピング
* TODO sax の型定義ファイル作成
* TODO ビルドツール導入
* TODO スクリプト引数のバリデーション



