import wordNet from 'wordnet-magic';

var wn = wordNet('data/wordnet.db');

export function getSynsetIDs(label){
  let word = new wn.Word(label);
  let result = word.getSynsets().then(synsets => {
    let ids = synsets.map(synset => {
      return synset.synsetid
    });
    return ids;
  });
  return result;
}

export function getAllSynsetIDs(label){
  let result = getAllSynsets(label).then(synsets => {
    let ids = synsets.map(synset => {
      return synset.synsetid
    });
    return ids;
  });
  return result;
}

function getAllSynsets(label){
  let word = new wn.Word(label);
  let result = word.getSynsets().then(synsets => {
    let promises = [];
    synsets.forEach(synset => {
      let hypernyms = synset.getHypernymsTree().then(parents => {
        let sets = [];
        parents.forEach(tree => {
          sets = sets.concat(parse_tree(tree, 'hypernym'));
        });
        return sets;
      });
      let hyponyms = synset.getHyponymsTree().then(children => {
        let sets = [];
        children.forEach(tree => {
          sets = sets.concat(parse_tree(tree, 'hyponym'));
        });
        return sets;
      });
      promises.push(hypernyms);
      promises.push(hyponyms);
    });
    promises.push(synsets);
    let promise = Promise.all(promises);
    promise = promise.then(values => {
      values = [].concat.apply([], values);
      return values;
    });
    return promise;
  });
  return result;
}

export function getHypernymIDs(label){
  let result = getHypernyms(label).then(synsets => {
    let ids = synsets.map(synset => {
      return synset.synsetid
    });
    return ids;
  });
  return result;
}

function getHypernyms(label){
  let word = new wn.Word(label);
  let result = word.getSynsets().then(synsets => {
    let promises = [];
    synsets.forEach(synset => {
      let hypernyms = synset.getHypernymsTree().then(parents => {
        let sets = [];
        parents.forEach(tree => {
          sets = sets.concat(parse_tree(tree, 'hypernym'));
        });
        return sets;
      });
      promises.push(hypernyms);
    });
    promises.push(synsets);
    let promise = Promise.all(promises);
    promise = promise.then(values => {
      values = [].concat.apply([], values);
      return values;
    });
    return promise;
  });
  return result;
}


export function areRelated(label1, label2){
  let synsets1 = getSynsetIDs(label1);
  let synsets2 = getAllSynsetIDs(label2);
  let promise = Promise.all([synsets1, synsets2]);
  promise = promise.then(values => {
    let synsets1 = values[0];
    let synsets2 = values[1];
    console.log(synsets1);
    console.log(synsets2);
    let found = false;
    for(let i=0; i<synsets1.length; i++){
      if(synsets2.indexOf(synsets1[i]) > 0){
        found = true;
        break
      }
    }
    if(found){
      return true;
    }else{
      throw 'Not related';
    }
  });
  return promise;
}

export function isHypernymOf(child, parent){
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
  let items = [synset];
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
