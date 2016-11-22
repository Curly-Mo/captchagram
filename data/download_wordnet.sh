#!/bin/bash

BASEDIR=$(dirname "$0")

if [ ! -f ${BASEDIR}/wordnet.db ]; then
  wget 'http://downloads.sourceforge.net/project/wnsql/wnsql3/sqlite/3.1/sqlite-31.db.zip?r=http%3A%2F%2Fsourceforge.net%2Fprojects%2Fwnsql%2Ffiles%2Fwnsql3%2Fsqlite%2F3.1%2Fsqlite-31.db.zip%2Fdownload&ts=1409711250&use_mirror=iweb' -O "sqlite-31.zip"
  unzip sqlite-31.zip 
  rm sqlite-31.zip
  mv sqlite-31.db ${BASEDIR}/wordnet.db
else
  echo "wordnet.db already exists"
fi
