export type Human = {
  name: string;
  age: number;
};

function changeName(human: Human, name: string): Human {
  return { ...human, name };
}

const firstHuman: Human = { name: "Adam", age: 33 };

importedFunction(firstHuman);

// const newHuman = changeName(firstHuman, ":)");

// let newHumanLet = changeName(firstHuman, ":(");

// function change(h: Human) {
//   const n = changeName(h, ":D");
// }

// const changeArrow = (h: Human) => {};

// importedFunction(firstHuman);
