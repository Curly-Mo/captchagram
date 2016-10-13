import wordNet from 'wordnet-magic';

var wn = wordNet('data/wordnet.db', true);

export function isHypernymOf(child, parent, callback){
  if(typeof parent === 'string'){
    parent = new wn.Word(parent);
  }
  if(parent instanceof wn.Word){
    let result = parent.getSynsets().then(function(data){
      return isHypernymOf(child, data);
    });
    return result;
  }
  if(typeof child === 'string'){
    child = new wn.Word(child);
  }
  if(child instanceof wn.Word){
    let result = child.getSynsets().then(function(data){
      let promises = data.map(function(synset){return isHypernymOfSynset(synset, parent)});
      let promise = Promise.any(promises);
      return promise;
    });
    return result;
  }
  if(child instanceof wn.Synset){
    return isHypernymOfSynset(child, parent);
  }
  throw 'Unkown input types';
}

function isHypernymOfSynset(child, parent){
  let promise = child.getHypernymsTree().then(function(data){
    let hypernyms = [child.synsetid];
    data.forEach(function(synset){
      hypernyms = hypernyms.concat(parse_tree(synset, 'hypernym'));
    });
    if(!(parent instanceof Array)){
      parent = [parent];
    }
    let found = false;
    parent.forEach(function(p){
      if(hypernyms.indexOf(p.synsetid) >= 0){
        found = true;
      }
    });
    if(found){
      return Promise.resolve();
    }else{
      return Promise.reject('Parent is not a hypernym of child');
    }
  }).catch(function(e){
    return Promise.reject(e);
  });
  return promise;
}

function parse_tree(synset, key){
  let items = [synset.synsetid];
  if(synset[key] != null){
    synset[key].forEach(function(next){
      items = items.concat(parse_tree(next, key));
    });
  }
  return items;
}

Promise.any = function(arrayOfPromises) {
  // For each promise that resolves or rejects, 
  // make them all resolve.
  // Record which ones did resolve or reject
  var resolvingPromises = arrayOfPromises.map(function(promise) {
    return promise.then(function(result) {
      return {
        resolve: true,
        result: result
      };
    }, function(error) {
      return {
        resolve: false,
        result: error
      };
    });
  });
  return Promise.all(resolvingPromises).then(function(results) {
    // Count how many passed/failed
    var passed = [], failed = [], allFailed = true;
    results.forEach(function(result) {
      if(result.resolve) {
        allFailed = false;
      }
      passed.push(result.resolve ? result.result : null);
      failed.push(result.resolve ? null : result.result);
    });

    if(allFailed) {
      return Promise.reject(failed);
    } else {
      return passed;
    }
  });
};
